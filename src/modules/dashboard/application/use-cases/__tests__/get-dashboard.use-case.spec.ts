import type { AccountLedger, AccountRepository } from '@modules/accounts';
import type { BudgetRepository, StoredBudget } from '@modules/budgets';
import type {
  CategorySpendingTotal,
  CreditCardPurchaseRepository,
  CreditCardStatements,
  InvoiceStatement,
} from '@modules/credit-cards';
import {
  ContributionKind,
  InvestmentMovementType,
  type ContributionKindTotal,
  type InvestmentMovementRepository,
  type InvestmentMovementTotal,
  type InvestmentRepository,
  type InvestmentValues,
  type InvestmentWithValue,
} from '@modules/investments';
import {
  DefaultMonth,
  SpendingPerspective,
  type UserPreferencesRepository,
} from '@modules/preferences';
import type {
  PlannedCardChargesDue,
  PlannedCardChargeTotal,
  RecurrenceCardChargeRepository,
  SavingPlan,
  SavingPlans,
} from '@modules/recurrences';
import { TransactionCategoryKind } from '@modules/transaction-categories';
import {
  TransactionState,
  TransactionType,
  type TransactionRepository,
} from '@modules/transactions';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildAccount } from '@test/support/builders/account.builder';
import {
  buildCreditCard,
  buildCreditCardInvoice,
  buildInvoiceStatement,
} from '@test/support/builders/credit-card.builder';
import { buildInvestment } from '@test/support/builders/investment.builder';
import { buildTransactionCategory } from '@test/support/builders/transaction-category.builder';
import { buildTransaction } from '@test/support/builders/transaction.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import { buildRecurrenceCardCharge } from '@test/support/builders/recurrence.builder';
import { SpendingGuidanceBasis } from '../../../domain/budget/spending-guidance';
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
    cards: {
      spending?: CategorySpendingTotal[];
      planned?: PlannedCardChargeTotal[];
      plannedDue?: PlannedCardChargesDue;
      statements?: InvoiceStatement[];
    } = {},
    budget: StoredBudget | null = null,
    investments: {
      items?: InvestmentWithValue[];
      totals?: InvestmentMovementTotal[];
      plannedAccountChanges?: Map<number, number>;
      kindTotals?: ContributionKindTotal[];
      savingPlans?: SavingPlan[];
    } = {},
  ) {
    const findAllByOwner = jest.fn().mockResolvedValue(accounts);

    const transactionRepository = {
      sumBalanceChanges: jest.fn().mockResolvedValue(new Map()),
      sumByTypeAndState: jest.fn().mockResolvedValue([]),
      sumExpensesByCategory: jest.fn().mockResolvedValue([]),
      findPlannedUntil: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      ...transactions,
    };

    const sumSpendingByCategory = jest
      .fn()
      .mockResolvedValue(cards.spending ?? []);

    const findPlannedDueThrough = jest
      .fn()
      .mockResolvedValue(cards.plannedDue ?? { items: [], count: 0, total: 0 });

    const findBudgetByMonth = jest.fn().mockResolvedValue(budget);

    const forMonth = jest.fn().mockResolvedValue(investments.savingPlans ?? []);

    const useCase = new GetDashboardUseCase(
      mockOf<AccountRepository>({ findAllByOwner }),
      mockOf<AccountLedger>({
        balanceChanges: jest.fn().mockResolvedValue(ledgerChanges),
      }),
      mockOf<UserPreferencesRepository>({
        findByUserId: jest.fn().mockResolvedValue(stored),
      }),
      mockOf<TransactionRepository>(transactionRepository),
      mockOf<CreditCardPurchaseRepository>({ sumSpendingByCategory }),
      mockOf<RecurrenceCardChargeRepository>({
        sumPlannedByCategory: jest.fn().mockResolvedValue(cards.planned ?? []),
        findPlannedDueThrough,
      }),
      mockOf<CreditCardStatements>({
        forOwner: jest.fn().mockResolvedValue(cards.statements ?? []),
      }),
      mockOf<BudgetRepository>({ findByMonth: findBudgetByMonth }),
      mockOf<InvestmentRepository>({
        findAllByOwner: jest
          .fn()
          .mockResolvedValue(
            (investments.items ?? []).map(({ investment }) => investment),
          ),
      }),
      mockOf<InvestmentMovementRepository>({
        sumAccountChanges: jest
          .fn()
          .mockResolvedValue(investments.plannedAccountChanges ?? new Map()),
        sumByTypeAndState: jest
          .fn()
          .mockResolvedValue(investments.totals ?? []),
        sumContributionsByKindAndState: jest
          .fn()
          .mockResolvedValue(investments.kindTotals ?? []),
      }),
      mockOf<InvestmentValues>({
        withValues: jest.fn().mockResolvedValue(investments.items ?? []),
      }),
      mockOf<SavingPlans>({ forMonth }),
    );

    return {
      useCase,
      forMonth,
      findBudgetByMonth,
      findPlannedDueThrough,
      findAllByOwner,
      transactionRepository,
      sumSpendingByCategory,
    };
  }

  it("totals the caller's active account balances exactly", async () => {
    const { useCase, findAllByOwner } = build(null);

    const summary = await useCase.execute({ ownerId: 8 });

    expect(findAllByOwner).toHaveBeenCalledWith(8, {
      status: RecordStatus.ACTIVE,
    });
    expect(summary.balances).toEqual({
      actual: 149990,
      projected: 149990,
      available: 149990,
    });
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
      collapsedDashboardCards: [],
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
      collapsedDashboardCards: [],
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

    expect(summary.balances).toEqual({
      actual: 0,
      projected: 0,
      available: 0,
    });
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
    expect(summary.balances).toEqual({
      actual: 149980,
      projected: 124980,
      available: 124980,
    });
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

  it('counts card spending of the perspective as completed expenses by category', async () => {
    const groceries = buildTransactionCategory({ id: 5, name: 'Groceries' });
    const shopping = buildTransactionCategory({ id: 6, name: 'Shopping' });

    const { useCase, sumSpendingByCategory } = build(
      null,
      undefined,
      {
        sumByTypeAndState: jest.fn().mockResolvedValue([
          {
            type: TransactionType.EXPENSE,
            state: TransactionState.PLANNED,
            total: 1000,
          },
        ]),
        sumExpensesByCategory: jest.fn().mockResolvedValue([
          {
            category: groceries,
            state: TransactionState.PLANNED,
            total: 1000,
          },
        ]),
      },
      undefined,
      {
        spending: [
          { category: groceries, total: 2500 },
          { category: shopping, total: 30000 },
        ],
      },
    );

    const summary = await useCase.execute({
      ownerId: 8,
      year: 2026,
      month: 11,
      perspective: SpendingPerspective.INVOICE_MONTH,
    });

    expect(sumSpendingByCategory).toHaveBeenCalledWith(8, {
      from: '2026-11-01',
      to: '2026-11-30',
      perspective: SpendingPerspective.INVOICE_MONTH,
    });
    expect(summary.creditCards.spending).toBe(32500);
    expect(summary.expenses).toEqual({
      total: 33500,
      completed: 32500,
      pending: 1000,
    });
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
      ['Shopping', 30000, 30000, 0],
      ['Groceries', 3500, 2500, 1000],
    ]);
  });

  it('lists invoices due in the period and unpaid earlier ones, and subtracts them from the available balance', async () => {
    const card = buildCreditCard({ name: 'Visa' });

    const statement = (referenceMonth: string, outstanding: number) =>
      buildInvoiceStatement({
        invoice: buildCreditCardInvoice({
          uuid: referenceMonth,
          card,
          referenceMonth,
          dueDate: `${referenceMonth.slice(0, 8)}12`,
        }),
        outstanding,
      });

    const { useCase } = build(null, undefined, {}, undefined, {
      statements: [
        statement('2026-09-01', 0),
        statement('2026-10-01', 4000),
        statement('2026-11-01', 30000),
        statement('2026-12-01', 10000),
      ],
    });

    const summary = await useCase.execute({
      ownerId: 8,
      year: 2026,
      month: 11,
    });

    expect(
      summary.creditCards.invoices.map(({ invoice }) => invoice.uuid),
    ).toEqual(['2026-10-01', '2026-11-01']);
    expect(summary.creditCards.outstanding).toBe(34000);
    expect(summary.balances).toEqual({
      actual: 149990,
      projected: 149990,
      available: 115990,
    });
  });

  it('counts planned recurring card charges of the period as pending expenses', async () => {
    const subscriptions = buildTransactionCategory({
      id: 7,
      name: 'Subscriptions',
    });

    const { useCase } = build(null, undefined, {}, undefined, {
      spending: [{ category: subscriptions, total: 5590 }],
      planned: [{ category: subscriptions, total: 5590 }],
    });

    const summary = await useCase.execute({ ownerId: 8 });

    expect(summary.creditCards.planned).toBe(5590);
    expect(summary.expenses).toEqual({
      total: 11180,
      completed: 5590,
      pending: 5590,
    });
    expect(summary.expensesByCategory).toEqual([
      expect.objectContaining({
        category: subscriptions,
        total: 11180,
        completed: 5590,
        pending: 5590,
      }),
    ]);
  });

  // The available balance must not move with the perspective, and a charge an
  // earlier month left unconfirmed is still owed when a later month is open.
  it('subtracts the planned charges due through the period from the available balance, whatever the charges of the period', async () => {
    const card = buildCreditCard({ uuid: 'card-uuid', name: 'Visa' });

    const charge = buildRecurrenceCardCharge({ date: '2026-09-15' });

    const { useCase, findPlannedDueThrough } = build(
      null,
      undefined,
      {},
      undefined,
      {
        planned: [],
        plannedDue: {
          items: [{ charge, recurrenceUuid: 'recurrence-uuid', card }],
          count: 12,
          total: 12000,
        },
      },
    );

    const summary = await useCase.execute({
      ownerId: 8,
      year: 2026,
      month: 10,
    });

    expect(findPlannedDueThrough).toHaveBeenCalledWith(8, '2026-10-01', 10);
    expect(summary.expenses.pending).toBe(0);
    expect(summary.creditCards).toMatchObject({
      planned: 0,
      plannedDue: 12000,
      plannedChargesCount: 12,
      plannedCharges: [
        { charge, recurrenceUuid: 'recurrence-uuid', card, overdue: true },
      ],
    });
    expect(summary.balances.available).toBe(149990 - 12000);
  });

  it('breaks contributions down by kind and hands the card obligations to the saving plans', async () => {
    const savingPlans = [
      { suggestedAdditional: 30000 },
      { suggestedAdditional: 5000 },
    ] as SavingPlan[];

    const { useCase, forMonth } = build(
      null,
      undefined,
      {},
      new Map(),
      {
        plannedDue: { items: [], count: 0, total: 2500 },
        statements: [
          buildInvoiceStatement({
            outstanding: 10000,
            invoice: buildCreditCardInvoice({ referenceMonth: '2026-10-01' }),
          }),
        ],
      },
      null,
      {
        kindTotals: [
          {
            kind: ContributionKind.MANDATORY,
            state: TransactionState.PLANNED,
            total: 70000,
          },
          {
            kind: ContributionKind.ADDITIONAL,
            state: TransactionState.COMPLETED,
            total: 60000,
          },
          {
            kind: ContributionKind.ONE_TIME,
            state: TransactionState.COMPLETED,
            total: 1000,
          },
        ],
        savingPlans,
      },
    );

    const { investments } = await useCase.execute({ ownerId: 8 });

    expect(investments.contributionBreakdown).toEqual({
      mandatoryPlanned: 70000,
      mandatoryCompleted: 0,
      additionalPlanned: 0,
      additionalCompleted: 60000,
      oneTimePlanned: 0,
      oneTimeCompleted: 1000,
    });
    expect(investments.savingPlans).toBe(savingPlans);
    expect(investments).not.toHaveProperty('suggestedAdditionalTotal');
    expect(forMonth).toHaveBeenCalledWith(
      8,
      expect.objectContaining({ year: 2026, month: 10 }),
      '2026-10-29',
      12500,
    );
  });

  it('projects planned contributions and totals investments without counting them as income or spending', async () => {
    const reserve = buildInvestment({ id: 3, targetAmount: 100000 });

    const { useCase } = build(null, undefined, {}, new Map(), {}, null, {
      items: [
        {
          investment: reserve,
          value: {
            current: 60000,
            contributed: 58000,
            withdrawn: 0,
            adjusted: 2000,
          },
        },
      ],
      totals: [
        {
          type: InvestmentMovementType.CONTRIBUTION,
          state: TransactionState.COMPLETED,
          total: 30000,
        },
        {
          type: InvestmentMovementType.CONTRIBUTION,
          state: TransactionState.PLANNED,
          total: 10000,
        },
        {
          type: InvestmentMovementType.WITHDRAWAL,
          state: TransactionState.COMPLETED,
          total: 5000,
        },
      ],
      plannedAccountChanges: new Map([[1, -10000]]),
    });

    const summary = await useCase.execute({ ownerId: 8 });

    expect(summary.accounts[0].projectedBalance).toBe(140010);
    expect(summary.balances.projected).toBe(139990);
    expect(summary.expenses.total).toBe(0);
    expect(summary.income.total).toBe(0);
    expect(summary.investments).toMatchObject({
      totalValue: 60000,
      contributions: { total: 40000, completed: 30000, pending: 10000 },
      withdrawals: { total: 5000, completed: 5000, pending: 0 },
    });
    expect(summary.investments.items[0].investment).toBe(reserve);
  });

  describe('budget and spending guidance', () => {
    const groceries = buildTransactionCategory({ id: 5, name: 'Groceries' });
    const travel = buildTransactionCategory({ id: 9, name: 'Travel' });

    const spending: Partial<TransactionRepository> = {
      sumByTypeAndState: jest.fn().mockResolvedValue([
        {
          type: TransactionType.EXPENSE,
          state: TransactionState.COMPLETED,
          total: 60000,
        },
        {
          type: TransactionType.EXPENSE,
          state: TransactionState.PLANNED,
          total: 20000,
        },
      ]),
      sumExpensesByCategory: jest.fn().mockResolvedValue([
        {
          category: groceries,
          state: TransactionState.COMPLETED,
          total: 60000,
        },
        {
          category: groceries,
          state: TransactionState.PLANNED,
          total: 20000,
        },
      ]),
    };

    function budgetOf(
      totalLimit: number | null,
      categoryLimits: StoredBudget['categoryLimits'] = [],
    ): StoredBudget {
      return {
        month: '2026-10-01',
        totalLimit,
        categoryLimits,
        updatedAt: new Date(),
      };
    }

    it('reports no budget and guides by the available balance when the month has none', async () => {
      const { useCase, findBudgetByMonth } = build(null);

      const summary = await useCase.execute({ ownerId: 8 });

      expect(findBudgetByMonth).toHaveBeenCalledWith(8, '2026-10-01');
      expect(summary.budget).toBeNull();
      expect(summary.spendingGuidance).toEqual({
        basis: SpendingGuidanceBasis.BALANCE,
        remaining: 149990,
        dailyAllowance: 49996,
      });
    });

    it('measures completed and planned spending against the overall and category limits once', async () => {
      const { useCase } = build(
        null,
        undefined,
        spending,
        undefined,
        {},
        budgetOf(100000, [
          { category: groceries, limit: 50000 },
          { category: travel, limit: 30000 },
        ]),
      );

      const summary = await useCase.execute({ ownerId: 8 });

      expect(summary.budget).toEqual({
        overall: {
          limit: 100000,
          total: 80000,
          completed: 60000,
          pending: 20000,
          remaining: 20000,
          overspent: 0,
        },
        categories: [
          {
            category: groceries,
            limit: 50000,
            total: 80000,
            completed: 60000,
            pending: 20000,
            remaining: 0,
            overspent: 30000,
          },
          {
            category: travel,
            limit: 30000,
            total: 0,
            completed: 0,
            pending: 0,
            remaining: 30000,
            overspent: 0,
          },
        ],
      });
      expect(summary.spendingGuidance).toEqual({
        basis: SpendingGuidanceBasis.BUDGET,
        remaining: 20000,
        dailyAllowance: 6666,
      });
    });

    it('reports overspending without a negative allowance', async () => {
      const { useCase } = build(
        null,
        undefined,
        spending,
        undefined,
        {},
        budgetOf(50000),
      );

      const summary = await useCase.execute({ ownerId: 8 });

      expect(summary.budget?.overall).toMatchObject({
        remaining: 0,
        overspent: 30000,
      });
      expect(summary.spendingGuidance).toEqual({
        basis: SpendingGuidanceBasis.BUDGET,
        remaining: 0,
        dailyAllowance: 0,
      });
    });

    it('guides by the available balance when the budget only has category limits', async () => {
      const { useCase } = build(
        null,
        undefined,
        spending,
        undefined,
        {},
        budgetOf(null, [{ category: groceries, limit: 50000 }]),
      );

      const summary = await useCase.execute({ ownerId: 8 });

      expect(summary.budget?.overall).toBeNull();
      expect(summary.budget?.categories).toHaveLength(1);
      expect(summary.spendingGuidance.basis).toBe(
        SpendingGuidanceBasis.BALANCE,
      );
    });

    it('spreads a future month over all its days and gives no allowance for a past month', async () => {
      const { useCase } = build(
        null,
        undefined,
        spending,
        undefined,
        {},
        budgetOf(100000),
      );

      const future = await useCase.execute({
        ownerId: 8,
        year: 2026,
        month: 11,
      });

      const past = await useCase.execute({ ownerId: 8, year: 2026, month: 9 });

      expect(future.spendingGuidance.dailyAllowance).toBe(666);
      expect(past.spendingGuidance).toMatchObject({
        remaining: 20000,
        dailyAllowance: null,
      });
    });
  });
});
