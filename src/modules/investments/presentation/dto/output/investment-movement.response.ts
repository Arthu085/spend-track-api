import { ApiProperty } from '@nestjs/swagger';
import { TransactionState } from '@modules/transactions';
import {
  TransactionAccountResponseDto,
  transactionStateLabel,
} from '@modules/transactions/presentation';
import { formatMoney } from '@shared/domain/money';
import { translateOrFallback } from '@shared/presentation/http';
import type { InvestmentMovementEntity } from '../../../domain/entities/investment-movement.entity';
import { InvestmentMovementType } from '../../../domain/enums/investment-movement-type.enum';

export class InvestmentMovementResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({ enum: InvestmentMovementType })
  type!: InvestmentMovementType;

  @ApiProperty()
  typeLabel!: string;

  @ApiProperty({
    example: '500.00',
    description:
      'Strictly positive for contributions and withdrawals; the signed value change for valuations (negative after a loss).',
  })
  amount!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-11-05' })
  date!: string;

  @ApiProperty({ enum: TransactionState })
  state!: TransactionState;

  @ApiProperty()
  stateLabel!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-11-05',
  })
  completedOn!: string | null;

  @ApiProperty({ type: Date, nullable: true, example: null })
  canceledAt!: Date | null;

  @ApiProperty({
    type: TransactionAccountResponseDto,
    nullable: true,
    description: 'Null for valuations.',
  })
  account!: TransactionAccountResponseDto | null;

  @ApiProperty()
  createdAt!: Date;

  static fromDomain(
    movement: InvestmentMovementEntity,
    translate: (key: string) => string,
  ): InvestmentMovementResponseDto {
    return Object.assign(new InvestmentMovementResponseDto(), {
      uuid: movement.uuid,
      type: movement.type,
      typeLabel: translateOrFallback(
        translate,
        `investments.movement_type.${movement.type.toLowerCase()}`,
        movement.type,
      ),
      amount: formatMoney(movement.amount),
      date: movement.date,
      state: movement.state,
      stateLabel: transactionStateLabel(movement.state, translate),
      completedOn: movement.completedOn,
      canceledAt: movement.canceledAt,
      account: movement.account
        ? TransactionAccountResponseDto.fromDomain(movement.account)
        : null,
      createdAt: movement.createdAt,
    });
  }
}
