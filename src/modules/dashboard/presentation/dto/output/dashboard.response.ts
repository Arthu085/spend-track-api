import { ApiProperty } from '@nestjs/swagger';
import { AccountType } from '@modules/accounts';
import { accountTypeLabel } from '@modules/accounts/presentation';
import { SpendingPerspective } from '@modules/preferences';
import { spendingPerspectiveLabel } from '@modules/preferences/presentation';
import type { TransactionCategoryEntity } from '@modules/transaction-categories';
import { transactionCategoryName } from '@modules/transaction-categories/presentation';
import { TransactionType } from '@modules/transactions';
import {
  TransactionAccountResponseDto,
  transactionTypeLabel,
} from '@modules/transactions/presentation';
import { formatMoney } from '@shared/domain/money';
import type {
  DashboardAccountBalance,
  DashboardAmounts,
  DashboardCategoryExpenses,
  DashboardSummary,
  DashboardUpcomingItem,
} from '../../../application/use-cases/get-dashboard.use-case';
import {
  PeriodTiming,
  type MonthPeriod,
} from '../../../domain/period/month-period';

export class DashboardPeriodResponseDto {
  @ApiProperty({ example: 2026 })
  year!: number;

  @ApiProperty({ minimum: 1, maximum: 12, example: 10 })
  month!: number;

  @ApiProperty({ type: String, format: 'date', example: '2026-10-01' })
  startDate!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-10-31' })
  endDate!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-10-29',
    description: 'Current date in America/Sao_Paulo.',
  })
  today!: string;

  @ApiProperty({ example: 31 })
  daysInMonth!: number;

  @ApiProperty({ enum: PeriodTiming })
  timing!: PeriodTiming;

  @ApiProperty({
    example: 3,
    description:
      'Days left including today: every day for a future month, 0 for a past one.',
  })
  remainingDays!: number;

  static fromDomain(period: MonthPeriod): DashboardPeriodResponseDto {
    return Object.assign(new DashboardPeriodResponseDto(), period);
  }
}

export class DashboardBalancesResponseDto {
  @ApiProperty({
    example: '1500.00',
    description: 'Sum of the actual balances of active accounts.',
  })
  actual!: string;

  @ApiProperty({
    example: '1500.00',
    description:
      'Expected balance of active accounts at the end of the period: the actual balance plus every planned transaction dated up to the end of the period, overdue ones included.',
  })
  projected!: string;
}

export class DashboardAmountsResponseDto {
  @ApiProperty({
    example: '5000.00',
    description: 'completed + pending.',
  })
  total!: string;

  @ApiProperty({ example: '3000.00', description: 'COMPLETED transactions.' })
  completed!: string;

  @ApiProperty({ example: '2000.00', description: 'PLANNED transactions.' })
  pending!: string;

  static fromDomain(amounts: DashboardAmounts): DashboardAmountsResponseDto {
    return Object.assign(new DashboardAmountsResponseDto(), {
      total: formatMoney(amounts.total),
      completed: formatMoney(amounts.completed),
      pending: formatMoney(amounts.pending),
    });
  }
}

export class DashboardCategoryResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({
    description:
      'Global transaction categories are named in the request language.',
  })
  name!: string;

  @ApiProperty({ type: String, nullable: true, example: '#1A2B3C' })
  color!: string | null;

  static fromDomain(
    category: TransactionCategoryEntity,
    translate: (key: string) => string,
  ): DashboardCategoryResponseDto {
    return Object.assign(new DashboardCategoryResponseDto(), {
      uuid: category.uuid,
      name: transactionCategoryName(category, translate),
      color: category.color,
    });
  }
}

export class DashboardCategoryExpensesResponseDto extends DashboardAmountsResponseDto {
  @ApiProperty({ type: DashboardCategoryResponseDto })
  category!: DashboardCategoryResponseDto;

  static fromCategory(
    entry: DashboardCategoryExpenses,
    translate: (key: string) => string,
  ): DashboardCategoryExpensesResponseDto {
    return Object.assign(
      new DashboardCategoryExpensesResponseDto(),
      DashboardAmountsResponseDto.fromDomain(entry),
      {
        category: DashboardCategoryResponseDto.fromDomain(
          entry.category,
          translate,
        ),
      },
    );
  }
}

export class DashboardUpcomingResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({ enum: TransactionType })
  type!: TransactionType;

  @ApiProperty()
  typeLabel!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ example: '1500.00' })
  amount!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-11-05' })
  date!: string;

  @ApiProperty({ description: 'The date is before today.' })
  overdue!: boolean;

  @ApiProperty({ type: TransactionAccountResponseDto })
  account!: TransactionAccountResponseDto;

  @ApiProperty({ type: TransactionAccountResponseDto, nullable: true })
  destinationAccount!: TransactionAccountResponseDto | null;

  @ApiProperty({
    type: DashboardCategoryResponseDto,
    nullable: true,
    description: 'Null for transfers.',
  })
  category!: DashboardCategoryResponseDto | null;

  static fromDomain(
    { transaction, overdue }: DashboardUpcomingItem,
    translate: (key: string) => string,
  ): DashboardUpcomingResponseDto {
    const dto = new DashboardUpcomingResponseDto();

    dto.uuid = transaction.uuid;
    dto.type = transaction.type;
    dto.typeLabel = transactionTypeLabel(transaction.type, translate);
    dto.description = transaction.description;
    dto.amount = formatMoney(transaction.amount);
    dto.date = transaction.date;
    dto.overdue = overdue;
    dto.account = TransactionAccountResponseDto.fromDomain(transaction.account);
    dto.destinationAccount = transaction.destinationAccount
      ? TransactionAccountResponseDto.fromDomain(transaction.destinationAccount)
      : null;
    dto.category = transaction.category
      ? DashboardCategoryResponseDto.fromDomain(transaction.category, translate)
      : null;

    return dto;
  }
}

export class DashboardAccountResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: AccountType })
  type!: AccountType;

  @ApiProperty()
  typeLabel!: string;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty({ example: '1500.00' })
  actualBalance!: string;

  @ApiProperty({ example: '1500.00' })
  projectedBalance!: string;

  static fromDomain(
    entry: DashboardAccountBalance,
    translate: (key: string) => string,
  ): DashboardAccountResponseDto {
    const dto = new DashboardAccountResponseDto();

    dto.uuid = entry.account.uuid;
    dto.name = entry.account.name;
    dto.type = entry.account.type;
    dto.typeLabel = accountTypeLabel(entry.account.type, translate);
    dto.isDefault = entry.account.isDefault;
    dto.actualBalance = formatMoney(entry.actualBalance);
    dto.projectedBalance = formatMoney(entry.projectedBalance);

    return dto;
  }
}

export class DashboardResponseDto {
  @ApiProperty({ type: DashboardPeriodResponseDto })
  period!: DashboardPeriodResponseDto;

  @ApiProperty({ enum: SpendingPerspective })
  perspective!: SpendingPerspective;

  @ApiProperty()
  perspectiveLabel!: string;

  @ApiProperty({ type: DashboardBalancesResponseDto })
  balances!: DashboardBalancesResponseDto;

  @ApiProperty({ type: [DashboardAccountResponseDto] })
  accounts!: DashboardAccountResponseDto[];

  @ApiProperty({
    type: DashboardAmountsResponseDto,
    description: 'Income dated inside the period; canceled ones never count.',
  })
  income!: DashboardAmountsResponseDto;

  @ApiProperty({
    type: DashboardAmountsResponseDto,
    description:
      'Expenses dated inside the period; transfers and canceled ones never count.',
  })
  expenses!: DashboardAmountsResponseDto;

  @ApiProperty({
    type: [DashboardCategoryExpensesResponseDto],
    description:
      'The same expenses grouped by category, largest total first; the totals add up to expenses.total.',
  })
  expensesByCategory!: DashboardCategoryExpensesResponseDto[];

  @ApiProperty({
    type: [DashboardUpcomingResponseDto],
    description:
      'Up to 10 pending planned transactions of any type dated up to the end of the period, overdue ones included, oldest first, whatever the status of their accounts. Not a breakdown of projected minus actual balances: transfers and items on inactive accounts are listed too.',
  })
  upcoming!: DashboardUpcomingResponseDto[];

  @ApiProperty({
    example: 7,
    description:
      'Number of pending planned transactions dated up to the end of the period.',
  })
  upcomingCount!: number;

  static fromDomain(
    summary: DashboardSummary,
    translate: (key: string) => string,
  ): DashboardResponseDto {
    const dto = new DashboardResponseDto();

    dto.period = DashboardPeriodResponseDto.fromDomain(summary.period);
    dto.perspective = summary.perspective;
    dto.perspectiveLabel = spendingPerspectiveLabel(
      summary.perspective,
      translate,
    );
    dto.balances = Object.assign(new DashboardBalancesResponseDto(), {
      actual: formatMoney(summary.balances.actual),
      projected: formatMoney(summary.balances.projected),
    });
    dto.accounts = summary.accounts.map((entry) =>
      DashboardAccountResponseDto.fromDomain(entry, translate),
    );
    dto.income = DashboardAmountsResponseDto.fromDomain(summary.income);
    dto.expenses = DashboardAmountsResponseDto.fromDomain(summary.expenses);
    dto.expensesByCategory = summary.expensesByCategory.map((entry) =>
      DashboardCategoryExpensesResponseDto.fromCategory(entry, translate),
    );
    dto.upcoming = summary.upcoming.map((item) =>
      DashboardUpcomingResponseDto.fromDomain(item, translate),
    );
    dto.upcomingCount = summary.upcomingCount;

    return dto;
  }
}
