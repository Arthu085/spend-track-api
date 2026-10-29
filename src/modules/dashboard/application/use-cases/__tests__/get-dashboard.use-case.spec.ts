import type { AccountLedger, AccountRepository } from '@modules/accounts';
import {
  DefaultMonth,
  SpendingPerspective,
  type UserPreferencesRepository,
} from '@modules/preferences';
import { TransactionCategoryKind } from '@modules/transaction-categories';
import {
  TransactionState,
  TransactionType,
  type TransactionRepository,
} from '@modules/transactions';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildAccount } from '@test/support/builders/account.builder';
import { buildTransactionCategory } from '@test/support/builders/transaction-category.builder';
import { buildTransaction } from '@test/support/builders/transaction.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import { PeriodTiming } from '../../../domain/period/month-period';
import { GetDashboardUseCase } from '../get-dashboard.use-case';

describe('GetDashboardUseCase', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-29T15:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function build(
    stored: Awaited<ReturnType<UserPreferencesRepository['findByUserId']>>,
    accounts = [
      buildAccount({ id: 1, uuid: 'a', openingBalance: 150010 }),
      buildAccount({ id: 2, uuid: 'b', openingBalance: -20 }),
    ],
    transactions: Partial<TransactionRepository> = {},
    ledgerChanges = new Map<number, number>(),
  ) {
    const findAllByOwner = jest.fn().mockResolvedValue(accounts);

    const transactionRepository = {
      sumBalanceChanges: jest.fn().mockResolvedValue(new Map()),
      sumByTypeAndState: jest.fn().mockResolvedValue([]),
      sumExpensesByCategory: jest.fn().mockResolvedValue([]),
      findPlannedUntil: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      ...transactions,
    };

    const useCase = new GetDashboardUseCase(
      mockOf<AccountRepository>({ findAllByOwner }),
      mockOf<AccountLedger>({
        balanceChanges: jest.fn().mockResolvedValue(ledgerChanges),
      }),
      mockOf<UserPreferencesRepository>({
        findByUserId: jest.fn().mockResolvedValue(stored),
      }),
      mockOf<TransactionRepository>(transactionRepository),
    );

    return { useCase, findAllByOwner, transactionRepository };
  }

  it("totals the caller's active account balances exactly", async () => {
    const { useCase, findAllByOwner } = build(null);

    const summary = await useCase.execute({ ownerId: 8 });

    expect(findAllByOwner).toHaveBeenCalledWith(8, {
      status: RecordStatus.ACTIVE,
    });
    expect(summary.balances).toEqual({ actual: 149990, projected: 149990 });
    expect(summary.accounts.map((entry) => entry.actualBalance)).toEqual([
      150010, -20,
    ]);
  });

  it('opens the current month with the stored perspective by default', async () => {
    const { useCase } = build(null);

    const summary = await useCase.execute({ ownerId: 8 });

    expect(summary.perspective).toBe(SpendingPerspective.PURCHASE_DATE);
    expect(summary.period).toMatchObject({
      year: 2026,
      month: 10,
      timing: PeriodTiming.CURRENT,
      remainingDays: 3,
    });
  });

  it('opens the next month when the user prefers it', async () => {
    const { useCase } = build({
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.NEXT,
      updatedAt: new Date(),
    });

    const summary = await useCase.execute({ ownerId: 8 });

    expect(summary.perspective).toBe(SpendingPerspective.INVOICE_MONTH);
    expect(summary.period).toMatchObject({
      year: 2026,
      month: 11,
      timing: PeriodTiming.FUTURE,
    });
  });

  it('uses the requested month and perspective without changing preferences', async () => {
    const { useCase } = build({
      spendingPerspective: SpendingPerspective.INVOICE_MONTH,
      defaultMonth: DefaultMonth.NEXT,
      updatedAt: new Date(),
    });

    const summary = await useCase.execute({
      ownerId: 8,
      year: 2025,
      month: 1,
      perspective: SpendingPerspective.PURCHASE_DATE,
    });

    expect(summary.perspective).toBe(SpendingPerspective.PURCHASE_DATE);
    expect(summary.period).toMatchObject({
      year: 2025,
      month: 1,
      timing: PeriodTiming.PAST,
      remainingDays: 0,
    });
  });

  it('reports zero figures when the user has no record yet', async () => {
    const { useCase, transactionRepository } = build(null, []);

    const summary = await useCase.execute({ ownerId: 8 });

    expect(summary.balances).toEqual({ actual: 0, projected: 0 });
    expect(summary.accounts).toEqual([]);
    expect(summary.income).toEqual({ total: 0, completed: 0, pending: 0 });
    expect(summary.expenses).toEqual({ total: 0, completed: 0, pending: 0 });
    expect(summary.expensesByCategory).toEqual([]);
    expect(summary.upcoming).toEqual([]);
    expect(summary.upcomingCount).toBe(0);
    expect(transactionRepository.sumBalanceChanges).not.toHaveBeenCalled();
  });

  it('projects each account with the planned transactions up to the end of the period', async () => {
    const { useCase, transactionRepository } = build(
      null,
      undefined,
      {
        sumBalanceChanges: jest.fn().mockResolvedValue(
          new Map([
            [1, -30000],
            [2, 5000],
          ]),
        ),
      },
      new Map([[1, -10]]),
    );

    const summary = await useCase.execute({
      ownerId: 8,
      year: 2026,
      month: 11,
    });

    expect(transactionRepository.sumBalanceChanges).toHaveBeenCalledWith(
      8,
      [1, 2],
      { state: TransactionState.PLANNED, until: '2026-11-30' },
    );
    expect(
      summary.accounts.map(({ actualBalance, projectedBalance }) => [
        actualBalance,
        projectedBalance,
      ]),
    ).toEqual([
      [150000, 120000],
      [-20, 4980],
    ]);
    expect(summary.balances).toEqual({ actual: 149980, projected: 124980 });
  });

  it('splits income and expenses of the period into completed and pending', async () => {
    const { useCase, transactionRepository } = build(null, undefined, {
      sumByTypeAndState: jest.fn().mockResolvedValue([
        {
          type: TransactionType.INCOME,
          state: TransactionState.COMPLETED,
          total: 300000,
        },
        {
          type: TransactionType.INCOME,
          state: TransactionState.PLANNED,
          total: 200000,
        },
        {
          type: TransactionType.EXPENSE,
          state: TransactionState.COMPLETED,
          total: 80000,
        },
      ]),
    });

    const summary = await useCase.execute({ ownerId: 8 });

    expect(transactionRepository.sumByTypeAndState).toHaveBeenCalledWith(8, {
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(summary.income).toEqual({
      total: 500000,
      completed: 300000,
      pending: 200000,
    });
    expect(summary.expenses).toEqual({
      total: 80000,
      completed: 80000,
      pending: 0,
    });
  });

  it('groups expenses by category, largest total first, then by name', async () => {
    const market = buildTransactionCategory({ id: 1, name: 'Market' });
    const housing = buildTransactionCategory({ id: 2, name: 'Housing' });
    const bills = buildTransactionCategory({ id: 3, name: 'Bills' });

    const { useCase } = build(null, undefined, {
      sumExpensesByCategory: jest.fn().mockResolvedValue([
        { category: market, state: TransactionState.COMPLETED, total: 300 },
        { category: housing, state: TransactionState.PLANNED, total: 500 },
        { category: market, state: TransactionState.PLANNED, total: 200 },
        { category: bills, state: TransactionState.PLANNED, total: 500 },
      ]),
    });

    const summary = await useCase.execute({ ownerId: 8 });

    expect(
      summary.expensesByCategory.map(
        ({ category, total, completed, pending }) => [
          category.name,
          total,
          completed,
          pending,
        ],
      ),
    ).toEqual([
      ['Bills', 500, 0, 500],
      ['Housing', 500, 0, 500],
      ['Market', 500, 300, 200],
    ]);
  });

  it('lists upcoming planned transactions and flags the overdue ones', async () => {
    const overdue = buildTransaction({ uuid: 'late', date: '2026-10-20' });

    const due = buildTransaction({
      uuid: 'due',
      date: '2026-10-29',
      category: buildTransactionCategory({
        kind: TransactionCategoryKind.EXPENSE,
      }),
    });

    const { useCase, transactionRepository } = build(null, undefined, {
      findPlannedUntil: jest
        .fn()
        .mockResolvedValue({ items: [overdue, due], total: 12 }),
    });

    const summary = await useCase.execute({ ownerId: 8 });

    expect(transactionRepository.findPlannedUntil).toHaveBeenCalledWith(
      8,
      '2026-10-31',
      10,
    );
    expect(
      summary.upcoming.map(({ transaction, overdue: late }) => [
        transaction.uuid,
        late,
      ]),
    ).toEqual([
      ['late', true],
      ['due', false],
    ]);
    expect(summary.upcomingCount).toBe(12);
  });
});
