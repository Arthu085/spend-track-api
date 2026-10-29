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
  DefaultMonth,
  SpendingPerspective,
  USER_PREFERENCES_REPOSITORY,
  resolveUserPreferences,
  type UserPreferencesRepository,
} from '@modules/preferences';
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

export interface DashboardSummary {
  period: MonthPeriod;
  perspective: SpendingPerspective;
  balances: { actual: number; projected: number };
  accounts: DashboardAccountBalance[];
  income: DashboardAmounts;
  expenses: DashboardAmounts;
  expensesByCategory: DashboardCategoryExpenses[];
  upcoming: DashboardUpcomingItem[];
  upcomingCount: number;
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

    return {
      period,
      perspective: input.perspective ?? preferences.spendingPerspective,
      balances: {
        actual: sumMoney(accounts.map((balance) => balance.actualBalance)),
        projected: sumMoney(
          accounts.map((balance) => balance.projectedBalance),
        ),
      },
      accounts,
      income: amountsOf(
        totals.filter((entry) => entry.type === TransactionType.INCOME),
      ),
      expenses: amountsOf(
        totals.filter((entry) => entry.type === TransactionType.EXPENSE),
      ),
      expensesByCategory: await this.expensesByCategory(input.ownerId, range),
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

    const planned = await this.transactionRepository.sumBalanceChanges(
      ownerId,
      accounts.map((account) => account.id),
      { state: TransactionState.PLANNED, until: period.endDate },
    );

    return accounts.map((account) => ({
      account,
      actualBalance: account.currentBalance,
      projectedBalance: account.currentBalance + (planned.get(account.id) ?? 0),
    }));
  }

  private async expensesByCategory(
    ownerId: number,
    range: { from: string; to: string },
  ): Promise<DashboardCategoryExpenses[]> {
    const rows = await this.transactionRepository.sumExpensesByCategory(
      ownerId,
      range,
    );

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
