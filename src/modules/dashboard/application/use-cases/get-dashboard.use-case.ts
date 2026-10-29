import { Inject, Injectable } from '@nestjs/common';
import {
  ACCOUNT_REPOSITORY,
  type AccountEntity,
  type AccountRepository,
} from '@modules/accounts';
import {
  DefaultMonth,
  SpendingPerspective,
  USER_PREFERENCES_REPOSITORY,
  resolveUserPreferences,
  type UserPreferencesRepository,
} from '@modules/preferences';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { sumMoney } from '@shared/domain/money';
import {
  FINANCE_TIME_ZONE,
  calendarDateIn,
  monthOf,
  resolveMonthPeriod,
  shiftMonth,
  type MonthPeriod,
  type MonthRef,
} from '../../domain/period/month-period';

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

export interface DashboardSummary {
  period: MonthPeriod;
  perspective: SpendingPerspective;
  balances: { actual: number; projected: number };
  accounts: DashboardAccountBalance[];
}

@Injectable()
export class GetDashboardUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
    @Inject(USER_PREFERENCES_REPOSITORY)
    private readonly preferencesRepository: UserPreferencesRepository,
  ) {}

  async execute(input: GetDashboardInput): Promise<DashboardSummary> {
    const preferences = resolveUserPreferences(
      await this.preferencesRepository.findByUserId(input.ownerId),
    );

    const today = calendarDateIn(new Date(), FINANCE_TIME_ZONE);

    const ref: MonthRef =
      input.year !== undefined && input.month !== undefined
        ? { year: input.year, month: input.month }
        : shiftMonth(
            monthOf(today),
            preferences.defaultMonth === DefaultMonth.NEXT ? 1 : 0,
          );

    const accounts = await this.accountRepository.findAllByOwner(
      input.ownerId,
      { status: RecordStatus.ACTIVE },
    );

    const balances = accounts.map((account) => ({
      account,
      actualBalance: account.currentBalance,
      projectedBalance: account.currentBalance,
    }));

    return {
      period: resolveMonthPeriod(ref, today),
      perspective: input.perspective ?? preferences.spendingPerspective,
      balances: {
        actual: sumMoney(balances.map((balance) => balance.actualBalance)),
        projected: sumMoney(
          balances.map((balance) => balance.projectedBalance),
        ),
      },
      accounts: balances,
    };
  }
}
