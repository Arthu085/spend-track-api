import { ApiProperty } from '@nestjs/swagger';
import { TransactionState } from '@modules/transactions';
import {
  TransactionAccountResponseDto,
  transactionStateLabel,
} from '@modules/transactions/presentation';
import { formatMoney } from '@shared/domain/money';
import { translateOrFallback } from '@shared/presentation/http';
import type { InvestmentMovementEntity } from '../../../domain/entities/investment-movement.entity';
import { ContributionKind } from '../../../domain/enums/contribution-kind.enum';
import { InvestmentMovementType } from '../../../domain/enums/investment-movement-type.enum';

export class InvestmentMovementRecurrenceResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-11-15',
    description:
      'Scheduled date of a MANDATORY contribution; never changes. Null for ADDITIONAL.',
  })
  occurrenceDate!: string | null;
}

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

  @ApiProperty({
    enum: ContributionKind,
    description:
      'ONE_TIME for manual movements (and every withdrawal and valuation), MANDATORY for an occurrence of a recurring contribution, ADDITIONAL for an accepted surplus contribution.',
  })
  contributionKind!: ContributionKind;

  @ApiProperty()
  contributionKindLabel!: string;

  @ApiProperty({
    type: InvestmentMovementRecurrenceResponseDto,
    nullable: true,
    description: 'Recurrence behind the contribution; null for ONE_TIME.',
  })
  recurrence!: InvestmentMovementRecurrenceResponseDto | null;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: null,
    description:
      'First day of the month an ADDITIONAL contribution belongs to; null otherwise.',
  })
  surplusMonth!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description:
      'What the saving plan suggested when an ADDITIONAL contribution was accepted; never changes afterward.',
  })
  suggestedAmount!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description:
      'Minimum retained balance when an ADDITIONAL contribution was accepted; never changes afterward.',
  })
  retainedMinimum!: string | null;

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
      contributionKind: movement.contributionKind,
      contributionKindLabel: translateOrFallback(
        translate,
        `investments.contribution_kind.${movement.contributionKind.toLowerCase()}`,
        movement.contributionKind,
      ),
      recurrence: movement.recurrence
        ? Object.assign(new InvestmentMovementRecurrenceResponseDto(), {
            uuid: movement.recurrence.uuid,
            occurrenceDate: movement.recurrence.occurrenceDate,
          })
        : null,
      surplusMonth: movement.surplusMonth,
      suggestedAmount:
        movement.suggestedAmount === null
          ? null
          : formatMoney(movement.suggestedAmount),
      retainedMinimum:
        movement.retainedMinimum === null
          ? null
          : formatMoney(movement.retainedMinimum),
      createdAt: movement.createdAt,
    });
  }
}
