import { ApiProperty } from '@nestjs/swagger';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { formatMoney } from '@shared/domain/money';
import { translateOrFallback } from '@shared/presentation/http';
import type { InvestmentWithValue } from '../../../application/services/investment-values';
import { InvestmentType } from '../../../domain/enums/investment-type.enum';
import { targetProgress } from '../../../domain/valuation/investment-value';

export function investmentTypeLabel(
  type: InvestmentType,
  translate: (key: string) => string,
): string {
  return translateOrFallback(
    translate,
    `investments.type.${type.toLowerCase()}`,
    type,
  );
}

export class InvestmentProgressResponseDto {
  @ApiProperty({
    example: '4000.00',
    description: 'targetAmount minus currentValue, or 0 once reached.',
  })
  remaining!: string;

  @ApiProperty({
    example: 60,
    description:
      'currentValue as a whole percentage of targetAmount, rounded down; above 100 once the target is exceeded.',
  })
  percent!: number;

  static of(current: number, target: number): InvestmentProgressResponseDto {
    const progress = targetProgress(current, target);

    return Object.assign(new InvestmentProgressResponseDto(), {
      remaining: formatMoney(progress.remaining),
      percent: progress.percent,
    });
  }
}

export class InvestmentResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: InvestmentType })
  type!: InvestmentType;

  @ApiProperty()
  typeLabel!: string;

  @ApiProperty({ type: String, nullable: true, example: '10000.00' })
  targetAmount!: string | null;

  @ApiProperty({
    example: '6000.00',
    description:
      'contributed minus withdrawn plus adjusted: the value of the investment from every completed movement.',
  })
  currentValue!: string;

  @ApiProperty({
    example: '5800.00',
    description: 'Completed contributions.',
  })
  contributed!: string;

  @ApiProperty({ example: '0.00', description: 'Completed withdrawals.' })
  withdrawn!: string;

  @ApiProperty({
    example: '200.00',
    description:
      'Net of the manual valuation adjustments; negative after a loss.',
  })
  adjusted!: string;

  @ApiProperty({
    type: InvestmentProgressResponseDto,
    nullable: true,
    description: 'Progress toward targetAmount; null without a target.',
  })
  progress!: InvestmentProgressResponseDto | null;

  @ApiProperty({ enum: RecordStatus })
  status!: RecordStatus;

  @ApiProperty()
  statusLabel!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromDomain(
    { investment, value }: InvestmentWithValue,
    translate: (key: string) => string,
  ): InvestmentResponseDto {
    const dto = new InvestmentResponseDto();

    dto.uuid = investment.uuid;
    dto.name = investment.name;
    dto.type = investment.type;
    dto.typeLabel = investmentTypeLabel(investment.type, translate);
    dto.targetAmount =
      investment.targetAmount === null
        ? null
        : formatMoney(investment.targetAmount);
    dto.currentValue = formatMoney(value.current);
    dto.contributed = formatMoney(value.contributed);
    dto.withdrawn = formatMoney(value.withdrawn);
    dto.adjusted = formatMoney(value.adjusted);
    dto.progress =
      investment.targetAmount === null
        ? null
        : InvestmentProgressResponseDto.of(
            value.current,
            investment.targetAmount,
          );
    dto.status = investment.status;
    dto.statusLabel = translateOrFallback(
      translate,
      `enums.record_status.${investment.status.toLowerCase()}`,
      investment.status,
    );
    dto.createdAt = investment.createdAt;
    dto.updatedAt = investment.updatedAt;

    return dto;
  }
}
