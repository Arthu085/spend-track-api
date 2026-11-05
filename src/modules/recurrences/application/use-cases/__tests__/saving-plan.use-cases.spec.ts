import { InactiveAccountError } from '@modules/accounts';
import {
  AdditionalContributionAlreadyExistsError,
  InactiveInvestmentError,
  type InvestmentMovementEntity,
  type InvestmentMovementRepository,
} from '@modules/investments';
import { TransactionState } from '@modules/transactions';
import type { TransactionManagerPort } from '@shared/application/ports';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { ValidationError } from '@shared/domain/errors';
import { buildAccount } from '@test/support/builders/account.builder';
import { buildInvestment } from '@test/support/builders/investment.builder';
import { buildRecurrence } from '@test/support/builders/recurrence.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { RecurrenceEntity } from '../../../domain/entities/recurrence.entity';
import { AdditionalContributionStrategy } from '../../../domain/enums/additional-contribution-strategy.enum';
import { RecurrenceState } from '../../../domain/enums/recurrence-state.enum';
import { RecurrenceType } from '../../../domain/enums/recurrence-type.enum';
import { AdditionalContributionExceedsSuggestionError } from '../../../domain/errors/additional-contribution-exceeds-suggestion.error';
import { AdditionalContributionOutsideMonthError } from '../../../domain/errors/additional-contribution-outside-month.error';
import { CompletedAdditionalContributionInFutureError } from '../../../domain/errors/completed-additional-contribution-in-future.error';
import { SavingPlanMonthClosedError } from '../../../domain/errors/saving-plan-month-closed.error';
import { SavingPlanNotActiveError } from '../../../domain/errors/saving-plan-not-active.error';
import type { RecurrenceReferences } from '../../services/recurrence-references';
import type { SavingPlans } from '../../services/saving-plans';
import { AcceptAdditionalContributionUseCase } from '../accept-additional-contribution.use-case';
import { ListSavingPlansUseCase } from '../list-saving-plans.use-case';

const transactionManager: TransactionManagerPort = {
  runInTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
  runInSavepoint: <T>(work: () => Promise<T>): Promise<T> => work(),
};

const account = buildAccount({ id: 3, openingBalanceDate: '2026-01-01' });

const recurrenceWith = (
  overrides: Parameters<typeof buildRecurrence>[0] = {},
) =>
  buildRecurrence({
    id: 9,
    uuid: 'recurrence',
    type: RecurrenceType.INVESTMENT_CONTRIBUTION,
    investment: buildInvestment({ id: 7 }),
    category: null,
    account,
    savingStrategy: {
      minimumRetainedBalance: 20000,
      additionalContribution: AdditionalContributionStrategy.REMAINING_SURPLUS,
    },
    ...overrides,
  });

function setup(recurrence: RecurrenceEntity = recurrenceWith()) {
  const lockOwnerFinances = jest.fn().mockResolvedValue(undefined);

  const create = jest.fn((movement: InvestmentMovementEntity) =>
    Promise.resolve(movement),
  );

  const forRecurrence = jest.fn().mockResolvedValue({
    month: '2026-11-01',
    suggestedAdditional: 60000,
    strategy: recurrence.savingStrategy,
    additional: null,
  });

  const useCase = new AcceptAdditionalContributionUseCase(
    mockOf<InvestmentMovementRepository>({ create }),
    transactionManager,
    mockOf<RecurrenceReferences>({
      lockOwnerFinances,
      lockRecurrence: jest.fn().mockResolvedValue(recurrence),
    }),
    mockOf<SavingPlans>({ forRecurrence }),
  );

  return { useCase, create, forRecurrence, lockOwnerFinances };
}

const input = (
  overrides: Partial<
    Parameters<AcceptAdditionalContributionUseCase['execute']>[0]
  > = {},
) => ({
  uuid: 'recurrence',
  ownerId: 1,
  year: 2026,
  month: 11,
  amount: 45000,
  state: TransactionState.PLANNED as const,
  ...overrides,
});

describe('AcceptAdditionalContributionUseCase', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-05T15:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('records the accepted amount with a snapshot of the suggestion, under the locks', async () => {
    const { useCase, lockOwnerFinances } = setup();

    await expect(useCase.execute(input())).resolves.toMatchObject({
      amount: 45000,
      date: '2026-11-05',
      state: TransactionState.PLANNED,
      completedOn: null,
      surplusMonth: '2026-11-01',
      suggestedAmount: 60000,
      retainedMinimum: 20000,
      recurrence: { id: 9, uuid: 'recurrence', occurrenceDate: null },
    });
    expect(lockOwnerFinances).toHaveBeenCalledWith(1);
  });

  it('rejects a stale suggestion or a zero available amount without explicit acknowledgment', async () => {
    const { useCase, create, forRecurrence } = setup();

    await expect(useCase.execute(input({ amount: 60001 }))).rejects.toThrow(
      AdditionalContributionExceedsSuggestionError,
    );
    forRecurrence.mockResolvedValue({
      month: '2026-11-01',
      suggestedAdditional: 0,
      strategy: recurrenceWith().savingStrategy,
      additional: null,
    });
    await expect(
      useCase.execute(input({ allowExceedingSuggestion: false })),
    ).rejects.toThrow(AdditionalContributionExceedsSuggestionError);
    expect(create).not.toHaveBeenCalled();

    await expect(
      useCase.execute(input({ allowExceedingSuggestion: true })),
    ).resolves.toMatchObject({ amount: 45000, suggestedAmount: 0 });
  });

  it('defaults a later month to its first day, and keeps a requested date', async () => {
    const { useCase } = setup();

    await expect(
      useCase.execute(input({ year: 2027, month: 2 })),
    ).resolves.toMatchObject({ date: '2027-02-01' });

    await expect(
      useCase.execute(
        input({ date: '2026-11-03', state: TransactionState.COMPLETED }),
      ),
    ).resolves.toMatchObject({
      date: '2026-11-03',
      completedOn: '2026-11-03',
    });

    await expect(
      useCase.execute(
        input({ date: '2026-11-20', state: TransactionState.PLANNED }),
      ),
    ).resolves.toMatchObject({ date: '2026-11-20', completedOn: null });
  });

  it('refuses a completed contribution dated after today, explicit or by default', async () => {
    const { useCase, create } = setup();

    await expect(
      useCase.execute(
        input({ date: '2026-11-06', state: TransactionState.COMPLETED }),
      ),
    ).rejects.toThrow(CompletedAdditionalContributionInFutureError);

    await expect(
      useCase.execute(
        input({ year: 2027, month: 2, state: TransactionState.COMPLETED }),
      ),
    ).rejects.toThrow(CompletedAdditionalContributionInFutureError);

    expect(create).not.toHaveBeenCalled();
  });

  it('refuses months outside the dates of the recurrence', async () => {
    const dated = setup(
      recurrenceWith({ startDate: '2026-11-20', endDate: '2027-01-10' }),
    );

    await expect(
      dated.useCase.execute(input({ year: 2026, month: 10 })),
    ).rejects.toThrow(SavingPlanNotActiveError);
    await expect(
      dated.useCase.execute(input({ year: 2027, month: 2 })),
    ).rejects.toThrow(SavingPlanNotActiveError);

    await expect(
      dated.useCase.execute(input({ year: 2026, month: 11 })),
    ).resolves.toBeDefined();
    await expect(
      dated.useCase.execute(input({ year: 2027, month: 1 })),
    ).resolves.toBeDefined();

    await expect(
      setup(recurrenceWith({ startDate: '2026-12-01' })).useCase.execute(
        input(),
      ),
    ).rejects.toThrow(SavingPlanNotActiveError);
  });

  it('rejects a month that has passed', async () => {
    const { useCase } = setup();

    await expect(useCase.execute(input({ month: 10 }))).rejects.toThrow(
      SavingPlanMonthClosedError,
    );
  });

  it.each(['2026-10-31', '2026-12-01'])(
    'rejects the date %s outside the month',
    async (date) => {
      const { useCase } = setup();

      await expect(useCase.execute(input({ date }))).rejects.toThrow(
        AdditionalContributionOutsideMonthError,
      );
    },
  );

  it('rejects a date before the opening of the account', async () => {
    const { useCase } = setup(
      recurrenceWith({
        account: buildAccount({ id: 3, openingBalanceDate: '2026-11-04' }),
      }),
    );

    await expect(
      useCase.execute(input({ date: '2026-11-03' })),
    ).rejects.toThrow(ValidationError);
  });

  it.each([
    ['paused', { state: RecurrenceState.PAUSED }],
    ['past its end date', { startDate: '2026-01-01', endDate: '2026-10-31' }],
    ['without a strategy', { savingStrategy: null }],
    [
      'with the NONE strategy',
      {
        savingStrategy: {
          minimumRetainedBalance: 0,
          additionalContribution: AdditionalContributionStrategy.NONE,
        },
      },
    ],
    [
      'of another type',
      {
        type: RecurrenceType.EXPENSE,
        investment: null,
        savingStrategy: null,
      },
    ],
  ])('rejects a recurrence %s', async (_, overrides) => {
    const { useCase } = setup(recurrenceWith(overrides));

    await expect(useCase.execute(input())).rejects.toThrow(
      SavingPlanNotActiveError,
    );
  });

  it('needs an active investment and an active account', async () => {
    await expect(
      setup(
        recurrenceWith({
          investment: buildInvestment({ status: RecordStatus.INACTIVE }),
        }),
      ).useCase.execute(input()),
    ).rejects.toThrow(InactiveInvestmentError);

    await expect(
      setup(
        recurrenceWith({
          account: buildAccount({ status: RecordStatus.INACTIVE }),
        }),
      ).useCase.execute(input()),
    ).rejects.toThrow(InactiveAccountError);
  });

  it('treats a deleted investment or account like an inactive one, creating nothing', async () => {
    const deletedAt = new Date('2026-11-01T00:00:00Z');

    const withDeletedInvestment = setup(
      recurrenceWith({ investment: buildInvestment({ deletedAt }) }),
    );

    await expect(
      withDeletedInvestment.useCase.execute(
        input({ state: TransactionState.COMPLETED }),
      ),
    ).rejects.toThrow(InactiveInvestmentError);
    expect(withDeletedInvestment.create).not.toHaveBeenCalled();

    const withDeletedAccount = setup(
      recurrenceWith({ account: buildAccount({ deletedAt }) }),
    );

    await expect(
      withDeletedAccount.useCase.execute(
        input({ state: TransactionState.COMPLETED }),
      ),
    ).rejects.toThrow(InactiveAccountError);
    expect(withDeletedAccount.create).not.toHaveBeenCalled();
  });

  it('refuses a second live contribution for the month', async () => {
    const { useCase, forRecurrence, create } = setup();

    forRecurrence.mockResolvedValue({
      month: '2026-11-01',
      suggestedAdditional: 0,
      strategy: recurrenceWith().savingStrategy,
      additional: { uuid: 'already' },
    });

    await expect(useCase.execute(input())).rejects.toThrow(
      AdditionalContributionAlreadyExistsError,
    );
    expect(create).not.toHaveBeenCalled();
  });
});

describe('ListSavingPlansUseCase', () => {
  it('asks the service for the requested month', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-05T15:00:00Z'));

    const forMonth = jest.fn().mockResolvedValue([]);

    await new ListSavingPlansUseCase(mockOf<SavingPlans>({ forMonth })).execute(
      { ownerId: 1, year: 2026, month: 12 },
    );

    expect(forMonth).toHaveBeenCalledWith(
      1,
      { year: 2026, month: 12 },
      '2026-11-05',
    );

    jest.useRealTimers();
  });
});
