import { ApiProperty } from '@nestjs/swagger';
import { formatMoney } from '@shared/domain/money';
import type { PendingOperationsSummary } from '@shared/domain/pending-operations';

export class PendingOperationsResponseDto {
  @ApiProperty({ example: 3, description: 'How many operations are planned.' })
  count!: number;

  @ApiProperty({
    example: '167.70',
    description: 'Sum of their amounts, as a decimal string in BRL.',
  })
  total!: string;

  static fromSummary(
    summary: PendingOperationsSummary,
  ): PendingOperationsResponseDto {
    return Object.assign(new PendingOperationsResponseDto(), {
      count: summary.count,
      total: formatMoney(summary.total),
    });
  }
}
