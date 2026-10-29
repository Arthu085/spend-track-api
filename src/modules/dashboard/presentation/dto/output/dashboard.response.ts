import { ApiProperty } from '@nestjs/swagger';
import { AccountType } from '@modules/accounts';
import { accountTypeLabel } from '@modules/accounts/presentation';
import { SpendingPerspective } from '@modules/preferences';
import { spendingPerspectiveLabel } from '@modules/preferences/presentation';
import { formatMoney } from '@shared/domain/money';
import type {
  DashboardAccountBalance,
  DashboardSummary,
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
      'Expected balance of active accounts at the end of the period, including planned items.',
  })
  projected!: string;
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

    return dto;
  }
}
