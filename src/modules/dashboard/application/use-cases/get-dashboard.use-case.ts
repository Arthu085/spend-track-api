import { Inject, Injectable } from '@nestjs/common';
import {
  ACCOUNT_LEDGERS,
  ACCOUNT_REPOSITORY,
  withCurrentBalances,
  type AccountEntity,
  type AccountLedger,
  type AccountRepository,
} from '@modules/accounts';
import {
  BUDGET_REPOSITORY,
  type BudgetRepository,
  type StoredBudget,
} from '@modules/budgets';
import {
  CREDIT_CARD_PURCHASE_REPOSITORY,
  CreditCardStatements,
  type CategorySpendingTotal,
  type CreditCardPurchaseRepository,
  type InvoiceStatement,
} from '@modules/credit-cards';
import {
  INVESTMENT_MOVEMENT_REPOSITORY,
  INVESTMENT_REPOSITORY,
  InvestmentMovementType,
  InvestmentValues,
  type InvestmentMovementRepository,
  type InvestmentRepository,
  type InvestmentWithValue,
} from '@modules/investments';
import {
  DefaultMonth,
  SpendingPerspective,
  USER_PREFERENCES_REPOSITORY,
  resolveUserPreferences,
  type UserPreferencesRepository,
} from '@modules/preferences';
import {
  RECURRENCE_CARD_CHARGE_REPOSITORY,
  type PlannedCardChargeTotal,
  type RecurrenceCardChargeRepository,
} from '@modules/recurrences';
import type { TransactionCategoryEntity } from '@modules/transaction-categories';
import {
  TRANSACTION_REPOSITORY,
  TransactionState,
  TransactionType,
  type TransactionEntity,
  type TransactionRepository,
} from '@modules/transactions';
import { financeToday } from '@shared/domain/calendar';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { sumMoney } from '@shared/domain/money';
import {
  limitProgress,
  spendingGuidance,
  type LimitProgress,
  type SpendingGuidance,
} from '../../domain/budget/spending-guidance';
import {
  monthOf,
  resolveMonthPeriod,
  shiftMonth,
  type MonthPeriod,
  type MonthRef,
} from '../../domain/period/month-period';

const UPCOMING_LIMIT = 10;

export interface GetDashboardInput {
  ownerId: number;
  year?: number;
  month?: number;
  perspective?: SpendingPerspective;
}

export interface DashboardAccountBalance {
  account: AccountEntity;
  actualBalance: number;
  projectedBalance: number;
}

export interface DashboardAmounts {
  total: number;
  completed: number;
  pending: number;
}

export interface DashboardCategoryExpenses extends DashboardAmounts {
  category: TransactionCategoryEntity;
}

export interface DashboardUpcomingItem {
  transaction: TransactionEntity;
  overdue: boolean;
}

export interface DashboardCreditCards {
  spending: number;
  planned: number;
  outstanding: number;
  invoices: InvoiceStatement[];
}

export interface DashboardBudgetLimit extends DashboardAmounts, LimitProgress {}

export interface DashboardBudgetCategory extends DashboardBudgetLimit {
  category: TransactionCategoryEntity;
}

export interface DashboardBudget {
  overall: DashboardBudgetLimit | null;
  categories: DashboardBudgetCategory[];
}

export interface DashboardInvestments {
  totalValue: number;
  contributions: DashboardAmounts;
  withdrawals: DashboardAmounts;
  items: InvestmentWithValue[];
}

export interface DashboardSummary {
  period: MonthPeriod;
  perspective: SpendingPerspective;
  balances: { actual: number; projected: number; available: number };
  accounts: DashboardAccountBalance[];
  income: DashboardAmounts;
  expenses: DashboardAmounts;
  expensesByCategory: DashboardCategoryExpenses[];
  upcoming: DashboardUpcomingItem[];
  upcomingCount: number;
  creditCards: DashboardCreditCards;
  budget: DashboardBudget | null;
  investments: DashboardInvestments;
  spendingGuidance: SpendingGuidance;
}

interface StateTotal {
  state: TransactionState;
  total: number;
}

function amountsOf(totals: readonly StateTotal[]): DashboardAmounts {
  const sumOf = (state: TransactionState): number =>
    sumMoney(
      totals.filter((entry) => entry.state === state).map(({ total }) => total),
    );

  const completed = sumOf(TransactionState.COMPLETED);
  const pending = sumOf(TransactionState.PLANNED);

  return { total: completed + pending, completed, pending };
}

function budgetLimitOf(
  limit: number,
  amounts: DashboardAmounts,
): DashboardBudgetLimit {
  return { ...amounts, ...limitProgress(limit, amounts.total) };
}

function budgetOf(
  budget: StoredBudget,
  expenses: DashboardAmounts,
  expensesByCategory: readonly DashboardCategoryExpenses[],
): DashboardBudget {
  const spentByCategory = new Map(
    expensesByCategory.map((entry) => [entry.category.id, entry]),
  );

  return {
    overall:
      budget.totalLimit === null
        ? null
        : budgetLimitOf(budget.totalLimit, expenses),
    categories: budget.categoryLimits.map(({ category, limit }) => {
      const spent = spentByCategory.get(category.id);

      return {
        category,
        ...budgetLimitOf(limit, {
          total: spent?.total ?? 0,
          completed: spent?.completed ?? 0,
          pending: spent?.pending ?? 0,
        }),
      };
    }),
  };
}

@Injectable()
export class GetDashboardUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
    @Inject(ACCOUNT_LEDGERS)
    private readonly accountLedger: AccountLedger,
    @Inject(USER_PREFERENCES_REPOSITORY)
    private readonly preferencesRepository: UserPreferencesRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: TransactionRepository,
    @Inject(CREDIT_CARD_PURCHASE_REPOSITORY)
    private readonly purchaseRepository: CreditCardPurchaseRepository,
    @Inject(RECURRENCE_CARD_CHARGE_REPOSITORY)
    private readonly cardChargeRepository: RecurrenceCardChargeRepository,
    private readonly creditCardStatements: CreditCardStatements,
    @Inject(BUDGET_REPOSITORY)
    private readonly budgetRepository: BudgetRepository,
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    @Inject(INVESTMENT_MOVEMENT_REPOSITORY)
    private readonly movementRepository: InvestmentMovementRepository,
    private readonly investmentValues: InvestmentValues,
  ) {}

  async execute(input: GetDashboardInput): Promise<DashboardSummary> {
    const preferences = resolveUserPreferences(
      await this.preferencesRepository.findByUserId(input.ownerId),
    );

    const today = financeToday();

    const ref: MonthRef =
      input.year !== undefined && input.month !== undefined
        ? { year: input.year, month: input.month }
        : shiftMonth(
            monthOf(today),
            preferences.defaultMonth === DefaultMonth.NEXT ? 1 : 0,
          );

    const period = resolveMonthPeriod(ref, today);
    const range = { from: period.startDate, to: period.endDate };
    const perspective = input.perspective ?? preferences.spendingPerspective;

    const accounts = await this.accountBalances(input.ownerId, period);

    const totals = await this.transactionRepository.sumByTypeAndState(
      input.ownerId,
      range,
    );

    const upcoming = await this.transactionRepository.findPlannedUntil(
      input.ownerId,
      period.endDate,
      UPCOMING_LIMIT,
    );

    const cardSpending = await this.purchaseRepository.sumSpendingByCategory(
      input.ownerId,
      { ...range, perspective },
    );

    const plannedCardCharges =
      await this.cardChargeRepository.sumPlannedByCategory(input.ownerId, {
        ...range,
        perspective,
      });

    const creditCards = await this.creditCards(
      input.ownerId,
      period,
      cardSpending,
      plannedCardCharges,
    );

    const projected = sumMoney(
      accounts.map((balance) => balance.projectedBalance),
    );

    const available = projected - creditCards.outstanding - creditCards.planned;

    const expenses = amountsOf([
      ...totals.filter((entry) => entry.type === TransactionType.EXPENSE),
      { state: TransactionState.COMPLETED, total: creditCards.spending },
      { state: TransactionState.PLANNED, total: creditCards.planned },
    ]);

    const expensesByCategory = await this.expensesByCategory(
      input.ownerId,
      range,
      cardSpending,
      plannedCardCharges,
    );

    const storedBudget = await this.budgetRepository.findByMonth(
      input.ownerId,
      period.startDate,
    );

    return {
      period,
      perspective,
      balances: {
        actual: sumMoney(accounts.map((balance) => balance.actualBalance)),
        projected,
        available,
      },
      accounts,
      income: amountsOf(
        totals.filter((entry) => entry.type === TransactionType.INCOME),
      ),
      expenses,
      expensesByCategory,
      creditCards,
      budget: storedBudget
        ? budgetOf(storedBudget, expenses, expensesByCategory)
        : null,
      investments: await this.investments(input.ownerId, range),
      spendingGuidance: spendingGuidance({
        totalLimit: storedBudget?.totalLimit ?? null,
        spent: expenses.total,
        available,
        remainingDays: period.remainingDays,
      }),
      upcoming: upcoming.items.map((transaction) => ({
        transaction,
        overdue: transaction.date < period.today,
      })),
      upcomingCount: upcoming.total,
    };
  }

  private async accountBalances(
    ownerId: number,
    period: MonthPeriod,
  ): Promise<DashboardAccountBalance[]> {
    const accounts = await withCurrentBalances(
      this.accountLedger,
      ownerId,
      await this.accountRepository.findAllByOwner(ownerId, {
        status: RecordStatus.ACTIVE,
      }),
    );

    if (accounts.length === 0) {
      return [];
    }

    const accountIds = accounts.map((account) => account.id);

    const plannedFilter = {
      state: TransactionState.PLANNED,
      until: period.endDate,
    };

    const planned = await this.transactionRepository.sumBalanceChanges(
      ownerId,
      accountIds,
      plannedFilter,
    );

    const plannedMovements = await this.movementRepository.sumAccountChanges(
      ownerId,
      accountIds,
      plannedFilter,
    );

    return accounts.map((account) => ({
      account,
      actualBalance: account.currentBalance,
      projectedBalance:
        account.currentBalance +
        (planned.get(account.id) ?? 0) +
        (plannedMovements.get(account.id) ?? 0),
    }));
  }

  private async investments(
    ownerId: number,
    range: { from: string; to: string },
  ): Promise<DashboardInvestments> {
    const items = await this.investmentValues.withValues(
      await this.investmentRepository.findAllByOwner(ownerId, {
        status: RecordStatus.ACTIVE,
      }),
    );

    const totals = await this.movementRepository.sumByTypeAndState(
      ownerId,
      range,
    );

    return {
      totalValue: sumMoney(items.map(({ value }) => value.current)),
      contributions: amountsOf(
        totals.filter(
          (entry) => entry.type === InvestmentMovementType.CONTRIBUTION,
        ),
      ),
      withdrawals: amountsOf(
        totals.filter(
          (entry) => entry.type === InvestmentMovementType.WITHDRAWAL,
        ),
      ),
      items,
    };
  }

  private async creditCards(
    ownerId: number,
    period: MonthPeriod,
    spending: readonly CategorySpendingTotal[],
    planned: readonly PlannedCardChargeTotal[],
  ): Promise<DashboardCreditCards> {
    const statements = await this.creditCardStatements.forOwner(ownerId);

    const invoices = statements
      .filter(
        ({ invoice, outstanding }) =>
          invoice.referenceMonth === period.startDate ||
          (invoice.referenceMonth < period.startDate && outstanding > 0),
      )
      .sort(
        (left, right) =>
          left.invoice.dueDate.localeCompare(right.invoice.dueDate) ||
          left.invoice.card.name.localeCompare(right.invoice.card.name),
      );

    return {
      spending: sumMoney(spending.map(({ total }) => total)),
      planned: sumMoney(planned.map(({ total }) => total)),
      outstanding: sumMoney(invoices.map(({ outstanding }) => outstanding)),
      invoices,
    };
  }

  private async expensesByCategory(
    ownerId: number,
    range: { from: string; to: string },
    cardSpending: readonly CategorySpendingTotal[],
    plannedCardCharges: readonly PlannedCardChargeTotal[],
  ): Promise<DashboardCategoryExpenses[]> {
    const rows = [
      ...(await this.transactionRepository.sumExpensesByCategory(
        ownerId,
        range,
      )),
      ...cardSpending.map(({ category, total }) => ({
        category,
        state: TransactionState.COMPLETED,
        total,
      })),
      ...plannedCardCharges.map(({ category, total }) => ({
        category,
        state: TransactionState.PLANNED,
        total,
      })),
    ];

    const byCategory = new Map<
      number,
      { category: TransactionCategoryEntity; totals: StateTotal[] }
    >();

    for (const row of rows) {
      const entry = byCategory.get(row.category.id) ?? {
        category: row.category,
        totals: [],
      };

      entry.totals.push(row);
      byCategory.set(row.category.id, entry);
    }

    return [...byCategory.values()]
      .map(({ category, totals }) => ({ category, ...amountsOf(totals) }))
      .sort(
        (left, right) =>
          right.total - left.total ||
          left.category.name.localeCompare(right.category.name),
      );
  }
}
