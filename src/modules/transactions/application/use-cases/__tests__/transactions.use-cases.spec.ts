import {
  AccountNotFoundError,
  InactiveAccountError,
  type AccountRepository,
} from '@modules/accounts';
import {
  InactiveTransactionCategoryError,
  TransactionCategoryKind,
  TransactionCategoryNotFoundError,
  type TransactionCategoryRepository,
} from '@modules/transaction-categories';
import type { TransactionManagerPort } from '@shared/application/ports';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildAccount } from '@test/support/builders/account.builder';
import { buildTransactionCategory } from '@test/support/builders/transaction-category.builder';
import { buildTransaction } from '@test/support/builders/transaction.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { TransactionEntity } from '../../../domain/entities/transaction.entity';
import { TransactionState } from '../../../domain/enums/transaction-state.enum';
import { TransactionType } from '../../../domain/enums/transaction-type.enum';
import { TransactionNotDeletableError } from '../../../domain/errors/transaction-not-deletable.error';
import { TransactionNotEditableError } from '../../../domain/errors/transaction-not-editable.error';
import { TransactionNotFoundError } from '../../../domain/errors/transaction-not-found.error';
import { TransactionStateTransitionError } from '../../../domain/errors/transaction-state-transition.error';
import type { TransactionRepository } from '../../../domain/repositories/transaction.repository';
import { CreateTransactionUseCase } from '../create-transaction.use-case';
import { DeleteTransactionUseCase } from '../delete-transaction.use-case';
import { GetTransactionUseCase } from '../get-transaction.use-case';
import { ListTransactionsUseCase } from '../list-transactions.use-case';
import { UpdateTransactionStateUseCase } from '../update-transaction-state.use-case';
import { UpdateTransactionUseCase } from '../update-transaction.use-case';

const transactionManager: TransactionManagerPort = {
  runInTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
  runInSavepoint: <T>(work: () => Promise<T>): Promise<T> => work(),
};

const source = buildAccount({ id: 1, uuid: 'source' });
const destination = buildAccount({ id: 2, uuid: 'destination' });
const groceries = buildTransactionCategory({ id: 5, uuid: 'groceries' });
const pets = buildTransactionCategory({ id: 6, uuid: 'pets' });

function setup(found: TransactionEntity | null = buildTransaction()) {
  const calls: string[] = [];

  const transactions = {
    findAllPaginatedByOwner: jest
      .fn()
      .mockResolvedValue({ items: [buildTransaction()], total: 21 }),
    findByUuidForOwner: jest.fn().mockResolvedValue(found),
    findByUuidForOwnerForUpdate: jest.fn(() => {
      calls.push('lock-transaction');
      return Promise.resolve(found);
    }),
    create: jest.fn((transaction: TransactionEntity) => {
      calls.push('create');
      return Promise.resolve(transaction);
    }),
    update: jest.fn((transaction: TransactionEntity) => {
      calls.push('update');
      return Promise.resolve(transaction);
    }),
    softDelete: jest.fn(() => {
      calls.push('delete');
      return Promise.resolve();
    }),
  };

  const accountsByUuid = new Map([
    ['source', source],
    ['destination', destination],
    ['inactive', buildAccount({ id: 3, status: RecordStatus.INACTIVE })],
  ]);

  const accounts = {
    lockOwnerAccounts: jest.fn(() => {
      calls.push('lock-accounts');
      return Promise.resolve();
    }),
    findByUuidForOwner: jest.fn((uuid: string) =>
      Promise.resolve(accountsByUuid.get(uuid) ?? null),
    ),
  };

  const categoriesByUuid = new Map([
    ['groceries', groceries],
    ['pets', pets],
    [
      'salary',
      buildTransactionCategory({
        id: 7,
        uuid: 'salary',
        kind: TransactionCategoryKind.INCOME,
      }),
    ],
    [
      'inactive',
      buildTransactionCategory({ id: 8, status: RecordStatus.INACTIVE }),
    ],
  ]);

  const categories = {
    findVisibleByUuid: jest.fn((uuid: string) =>
      Promise.resolve(categoriesByUuid.get(uuid) ?? null),
    ),
  };

  return {
    calls,
    transactions,
    accounts,
    categories,
    transactionPort: mockOf<TransactionRepository>(transactions),
    accountPort: mockOf<AccountRepository>(accounts),
    categoryPort: mockOf<TransactionCategoryRepository>(categories),
  };
}

describe('transactions use-cases', () => {
  describe('ListTransactionsUseCase', () => {
    it("pages the caller's transactions with normalized filters", async () => {
      const { transactions, transactionPort } = setup();

      const result = await new ListTransactionsUseCase(transactionPort).execute(
        {
          ownerId: 4,
          page: 2,
          limit: 10,
          from: '2026-10-01',
          to: '2026-10-31',
          description: '  market ',
          state: TransactionState.PLANNED,
        },
      );

      expect(transactions.findAllPaginatedByOwner).toHaveBeenCalledWith(
        4,
        10,
        10,
        {
          from: '2026-10-01',
          to: '2026-10-31',
          type: undefined,
          state: TransactionState.PLANNED,
          accountUuid: undefined,
          categoryUuid: undefined,
          description: 'market',
        },
      );
      expect(result).toMatchObject({ total: 21, page: 2, limit: 10 });
    });
  });

  describe('GetTransactionUseCase', () => {
    it('looks the transaction up within the caller ownership', async () => {
      const { transactions, transactionPort } = setup();

      await new GetTransactionUseCase(transactionPort).execute('uuid', 4);

      expect(transactions.findByUuidForOwner).toHaveBeenCalledWith('uuid', 4);
    });

    // Another user's transaction is reported exactly like a missing one.
    it('reports a transaction outside the caller ownership as not found', async () => {
      const { transactionPort } = setup(null);

      await expect(
        new GetTransactionUseCase(transactionPort).execute('uuid', 4),
      ).rejects.toBeInstanceOf(TransactionNotFoundError);
    });
  });

  describe('CreateTransactionUseCase', () => {
    function create(
      ctx: ReturnType<typeof setup>,
      overrides: Partial<
        Parameters<CreateTransactionUseCase['execute']>[0]
      > = {},
    ) {
      return new CreateTransactionUseCase(
        ctx.transactionPort,
        ctx.accountPort,
        ctx.categoryPort,
        transactionManager,
      ).execute({
        ownerId: 4,
        type: TransactionType.EXPENSE,
        description: 'Market',
        amount: 25040,
        date: '2026-10-29',
        state: TransactionState.PLANNED,
        accountUuid: 'source',
        categoryUuid: 'groceries',
        ...overrides,
      });
    }

    it('creates an expense from owned references under the owner lock', async () => {
      const ctx = setup();

      const created = await create(ctx);

      expect(ctx.accounts.findByUuidForOwner).toHaveBeenCalledWith('source', 4);
      expect(ctx.categories.findVisibleByUuid).toHaveBeenCalledWith(
        'groceries',
        4,
      );
      expect(ctx.calls).toEqual(['lock-accounts', 'create']);
      expect(created).toMatchObject({
        ownerId: 4,
        amount: 25040,
        notes: null,
        state: TransactionState.PLANNED,
      });
      expect(created.category?.uuid).toBe('groceries');
    });

    it('creates a completed transfer between two own accounts', async () => {
      const ctx = setup();

      const created = await create(ctx, {
        type: TransactionType.TRANSFER,
        state: TransactionState.COMPLETED,
        completedOn: '2026-10-30',
        destinationAccountUuid: 'destination',
        categoryUuid: undefined,
      });

      expect(created).toMatchObject({
        completedOn: '2026-10-30',
        category: null,
      });
      expect(created.destinationAccount?.uuid).toBe('destination');
    });

    it.each([
      ['a foreign account', { accountUuid: 'foreign' }, AccountNotFoundError],
      [
        'an inactive account',
        { accountUuid: 'inactive' },
        InactiveAccountError,
      ],
      [
        'a foreign category',
        { categoryUuid: 'foreign' },
        TransactionCategoryNotFoundError,
      ],
      [
        'an inactive category',
        { categoryUuid: 'inactive' },
        InactiveTransactionCategoryError,
      ],
    ])('rejects %s', async (_, overrides, error) => {
      const ctx = setup();

      await expect(create(ctx, overrides)).rejects.toBeInstanceOf(error);
      expect(ctx.transactions.create).not.toHaveBeenCalled();
    });
  });

  describe('UpdateTransactionUseCase', () => {
    function update(
      ctx: ReturnType<typeof setup>,
      changes: Partial<Parameters<UpdateTransactionUseCase['execute']>[0]>,
    ) {
      return new UpdateTransactionUseCase(
        ctx.transactionPort,
        ctx.accountPort,
        ctx.categoryPort,
        transactionManager,
      ).execute({ uuid: 'transaction-uuid', ownerId: 1, ...changes });
    }

    it('applies the sent fields to a planned transaction and keeps the others', async () => {
      const ctx = setup(
        buildTransaction({ account: source, category: groceries }),
      );

      const updated = await update(ctx, {
        amount: 100,
        accountUuid: 'destination',
        notes: 'note',
      });

      expect(updated).toMatchObject({
        amount: 100,
        description: 'Groceries',
        notes: 'note',
      });
      expect(updated.account.uuid).toBe('destination');
      expect(ctx.calls).toEqual([
        'lock-accounts',
        'lock-transaction',
        'update',
      ]);
    });

    it('clears the notes with null', async () => {
      const ctx = setup(buildTransaction({ notes: 'old' }));

      const updated = await update(ctx, { notes: null });

      expect(updated.notes).toBeNull();
    });

    it('keeps an unchanged reference without re-checking its status', async () => {
      const inactiveCategory = buildTransactionCategory({
        uuid: 'archived',
        status: RecordStatus.INACTIVE,
      });

      const ctx = setup(buildTransaction({ category: inactiveCategory }));

      const updated = await update(ctx, {
        categoryUuid: 'archived',
        description: 'Renamed',
      });

      expect(updated.category).toBe(inactiveCategory);
      expect(ctx.categories.findVisibleByUuid).not.toHaveBeenCalled();
    });

    it('lets a completed transaction change its category and notes', async () => {
      const ctx = setup(
        buildTransaction({
          state: TransactionState.COMPLETED,
          completedOn: '2026-10-29',
          category: groceries,
        }),
      );

      const updated = await update(ctx, { categoryUuid: 'pets' });

      expect(updated.category?.uuid).toBe('pets');
    });

    it('refuses to change the amount of a completed transaction', async () => {
      const ctx = setup(
        buildTransaction({
          state: TransactionState.COMPLETED,
          completedOn: '2026-10-29',
        }),
      );

      await expect(update(ctx, { amount: 1 })).rejects.toBeInstanceOf(
        TransactionNotEditableError,
      );
      expect(ctx.transactions.update).not.toHaveBeenCalled();
    });

    it('rejects a newly referenced inactive account', async () => {
      const ctx = setup();

      await expect(
        update(ctx, { accountUuid: 'inactive' }),
      ).rejects.toBeInstanceOf(InactiveAccountError);
    });

    it('reports a foreign transaction as not found', async () => {
      const ctx = setup(null);

      await expect(update(ctx, { amount: 1 })).rejects.toBeInstanceOf(
        TransactionNotFoundError,
      );
    });
  });

  describe('UpdateTransactionStateUseCase', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-01T02:30:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    function changeState(
      ctx: ReturnType<typeof setup>,
      state: TransactionState.COMPLETED | TransactionState.CANCELED,
      completedOn?: string,
    ) {
      return new UpdateTransactionStateUseCase(
        ctx.transactionPort,
        ctx.accountPort,
        transactionManager,
      ).execute({ uuid: 'transaction-uuid', ownerId: 1, state, completedOn });
    }

    it('completes a planned transaction on today in São Paulo by default', async () => {
      const ctx = setup();

      const completed = await changeState(ctx, TransactionState.COMPLETED);

      expect(completed).toMatchObject({
        state: TransactionState.COMPLETED,
        completedOn: '2026-10-31',
      });
      expect(ctx.calls).toEqual([
        'lock-accounts',
        'lock-transaction',
        'update',
      ]);
    });

    it('uses the effective date sent by the caller', async () => {
      const ctx = setup();

      const completed = await changeState(
        ctx,
        TransactionState.COMPLETED,
        '2026-10-15',
      );

      expect(completed.completedOn).toBe('2026-10-15');
    });

    it('completes a transaction only once', async () => {
      const ctx = setup(
        buildTransaction({
          state: TransactionState.COMPLETED,
          completedOn: '2026-10-29',
        }),
      );

      await expect(
        changeState(ctx, TransactionState.COMPLETED),
      ).rejects.toBeInstanceOf(TransactionStateTransitionError);
      expect(ctx.transactions.update).not.toHaveBeenCalled();
    });

    it('refuses to complete a transfer into an inactive account', async () => {
      const ctx = setup(
        buildTransaction({
          type: TransactionType.TRANSFER,
          category: null,
          destinationAccount: buildAccount({
            id: 9,
            status: RecordStatus.INACTIVE,
          }),
        }),
      );

      await expect(
        changeState(ctx, TransactionState.COMPLETED),
      ).rejects.toBeInstanceOf(InactiveAccountError);
    });

    it('cancels a transaction even when its account is inactive', async () => {
      const ctx = setup(
        buildTransaction({
          account: buildAccount({ status: RecordStatus.INACTIVE }),
        }),
      );

      const canceled = await changeState(ctx, TransactionState.CANCELED);

      expect(canceled.state).toBe(TransactionState.CANCELED);
    });
  });

  describe('DeleteTransactionUseCase', () => {
    function remove(ctx: ReturnType<typeof setup>) {
      return new DeleteTransactionUseCase(
        ctx.transactionPort,
        transactionManager,
      ).execute({ uuid: 'transaction-uuid', ownerId: 1 });
    }

    it('soft-deletes a planned transaction after locking it', async () => {
      const ctx = setup();

      await remove(ctx);

      expect(ctx.calls).toEqual(['lock-transaction', 'delete']);
    });

    it('keeps completed transactions as history', async () => {
      const ctx = setup(
        buildTransaction({
          state: TransactionState.COMPLETED,
          completedOn: '2026-10-29',
        }),
      );

      await expect(remove(ctx)).rejects.toBeInstanceOf(
        TransactionNotDeletableError,
      );
      expect(ctx.transactions.softDelete).not.toHaveBeenCalled();
    });
  });
});
