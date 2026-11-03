import { ApiProperty } from '@nestjs/swagger';
import { TransactionCategoryRefResponseDto } from '@modules/transactions/presentation';
import { formatMoney } from '@shared/domain/money';
import type { BudgetCategoryLimit } from '../../../domain/repositories/budget.repository';
import type { MonthlyBudget } from '../../../application/use-cases/get-budget.use-case';

export class BudgetCategoryLimitResponseDto {
  @ApiProperty({ type: TransactionCategoryRefResponseDto })
  category!: TransactionCategoryRefResponseDto;

  @ApiProperty({ example: '800.00' })
  limit!: string;

  static fromDomain(
    entry: BudgetCategoryLimit,
    translate: (key: string) => string,
  ): BudgetCategoryLimitResponseDto {
    return Object.assign(new BudgetCategoryLimitResponseDto(), {
      category: TransactionCategoryRefResponseDto.fromDomain(
        entry.category,
        translate,
      ),
      limit: formatMoney(entry.limit),
    });
  }
}

export class BudgetResponseDto {
  @ApiProperty({ example: 2026 })
  year!: number;

  @ApiProperty({ minimum: 1, maximum: 12, example: 11 })
  month!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '3000.00',
    description: 'Overall spending limit of the month; null when not set.',
  })
  totalLimit!: string | null;

  @ApiProperty({
    type: [BudgetCategoryLimitResponseDto],
    description: 'Category limits in the order they were saved.',
  })
  categoryLimits!: BudgetCategoryLimitResponseDto[];

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Null when the month has no budget.',
  })
  updatedAt!: Date | null;

  static fromDomain(
    budget: MonthlyBudget,
    translate: (key: string) => string,
  ): BudgetResponseDto {
    return Object.assign(new BudgetResponseDto(), {
      year: budget.period.year,
      month: budget.period.month,
      totalLimit:
        budget.totalLimit === null ? null : formatMoney(budget.totalLimit),
      categoryLimits: budget.categoryLimits.map((entry) =>
        BudgetCategoryLimitResponseDto.fromDomain(entry, translate),
      ),
      updatedAt: budget.updatedAt,
    });
  }
}
