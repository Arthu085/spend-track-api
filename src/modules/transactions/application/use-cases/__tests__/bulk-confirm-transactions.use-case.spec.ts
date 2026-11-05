import type { AccountRepository } from '@modules/accounts';
import type { TransactionManagerPort } from '@shared/application/ports';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildAccount } from '@test/support/builders/account.builder';
import { buildTransaction } from '@test/support/builders/transaction.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import { BulkConfirmationOutcome } from '../../../domain/enums/bulk-confirmation-outcome.enum';
import { ConfirmationBlockedReason } from '../../../domain/enums/confirmation-blocked-reason.enum';
import { TransactionState } from '../../../domain/enums/transaction-state.enum';
import { TransactionNotFoundError } from '../../../domain/errors/transaction-not-found.error';
import type { TransactionRepository } from '../../../domain/repositories/transaction.repository';
import { BulkConfirmTransactionsUseCase } from '../bulk-confirm-transactions.use-case';
import { ListPendingConfirmationsUseCase } from '../list-pending-confirmations.use-case';
import type { UpdateTransactionStateUseCase } from '../update-transaction-state.use-case';

const manager: TransactionManagerPort = {
  runInTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
  runInSavepoint: jest.fn(<T>(work: () => Promise<T>): Promise<T> => work()),
};

function setup() {
  const planned = buildTransaction({ uuid: 'planned' });

  const completed = buildTransaction({
    uuid: 'completed',
    state: TransactionState.COMPLETED,
    completedOn: '2026-10-29',
  });

  const repository = {
    findByUuidForOwnerForUpdate: jest.fn((uuid: string) =>
      Promise.resolve(
        new Map([
          ['planned', planned],
          ['completed', completed],
        ]).get(uuid) ?? null,
      ),
    ),
  };

  const updateState = {
    execute: jest.fn().mockResolvedValue(completed),
  };

  const accounts = {
    lockOwnerAccounts: jest.fn().mockResolvedValue(undefined),
  };

  const useCase = new BulkConfirmTransactionsUseCase(
    mockOf<TransactionRepository>(repository),
    mockOf<AccountRepository>(accounts),
    manager,
    mockOf<UpdateTransactionStateUseCase>(updateState),
  );

  return { useCase, updateState, accounts };
}

describe('BulkConfirmTransactionsUseCase', () => {
  it('locks once and reports each outcome without failing the batch', async () => {
    const { useCase, updateState, accounts } = setup();

    const results = await useCase.execute(1, [
      { uuid: 'planned', completedOn: '2026-11-01' },
      { uuid: 'completed' },
      { uuid: 'missing' },
    ]);

    expect(accounts.lockOwnerAccounts).toHaveBeenCalledTimes(1);
    expect(results.map(({ outcome }) => outcome)).toEqual([
      BulkConfirmationOutcome.CONFIRMED,
      BulkConfirmationOutcome.ALREADY_COMPLETED,
      BulkConfirmationOutcome.FAILED,
    ]);
    expect(results[2].error).toBeInstanceOf(TransactionNotFoundError);
    expect(updateState.execute).toHaveBeenCalledTimes(1);
    expect(updateState.execute).toHaveBeenCalledWith({
      uuid: 'planned',
      ownerId: 1,
      state: TransactionState.COMPLETED,
      completedOn: '2026-11-01',
    });
  });

  it('aborts the batch on an unexpected error', async () => {
    const { useCase, updateState } = setup();

    updateState.execute.mockRejectedValue(new Error('database down'));

    await expect(useCase.execute(1, [{ uuid: 'planned' }])).rejects.toThrow(
      'database down',
    );
  });
});

describe('ListPendingConfirmationsUseCase', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-10T15:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function pendingOf(
    ...transactions: ReturnType<typeof buildTransaction>[]
  ) {
    return new ListPendingConfirmationsUseCase(
      mockOf<TransactionRepository>({
        findAllPlannedUntil: jest.fn().mockResolvedValue(transactions),
      }),
    ).execute(1, '2026-11-30');
  }

  const opened = buildAccount({ openingBalanceDate: '2026-01-01' });

  it('classifies dates relative to today', async () => {
    const pending = await pendingOf(
      buildTransaction({ date: '2026-11-09', account: opened }),
      buildTransaction({ date: '2026-11-10', account: opened }),
      buildTransaction({ date: '2026-11-11', account: opened }),
    );

    expect(
      pending.map(({ overdue, future, blockedReason }) => [
        overdue,
        future,
        blockedReason,
      ]),
    ).toEqual([
      [true, false, null],
      [false, false, null],
      [false, true, null],
    ]);
  });

  it('blocks inactive accounts, also on the destination of a transfer', async () => {
    const closed = buildAccount({ status: RecordStatus.INACTIVE });

    const pending = await pendingOf(
      buildTransaction({ date: '2026-11-09', account: closed }),
      buildTransaction({
        date: '2026-11-09',
        account: opened,
        destinationAccount: closed,
      }),
    );

    expect(pending.map(({ blockedReason }) => blockedReason)).toEqual([
      ConfirmationBlockedReason.INACTIVE_ACCOUNT,
      ConfirmationBlockedReason.INACTIVE_ACCOUNT,
    ]);
  });

  it('blocks accounts not open yet and answers the latest opening date', async () => {
    const later = buildAccount({ openingBalanceDate: '2026-12-01' });

    const [pending] = await pendingOf(
      buildTransaction({
        date: '2026-12-05',
        account: opened,
        destinationAccount: later,
      }),
    );

    expect(pending).toMatchObject({
      blockedReason: ConfirmationBlockedReason.BEFORE_ACCOUNT_OPENING,
      earliestCompletedOn: '2026-12-01',
    });
  });
});
