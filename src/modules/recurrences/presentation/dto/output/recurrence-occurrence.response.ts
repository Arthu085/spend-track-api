import { ApiProperty } from '@nestjs/swagger';
import { TransactionState } from '@modules/transactions';
import { transactionStateLabel } from '@modules/transactions/presentation';
import { formatMoney } from '@shared/domain/money';
import type { RecurrenceOccurrence } from '../../../application/services/recurrence-occurrence';

export class RecurrenceOccurrenceResponseDto {
  @ApiProperty({
    description:
      'Uuid of the occurrence: the transaction of an account recurrence, the charge of a card recurrence, the movement of an investment contribution.',
  })
  uuid!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-11-15',
    description:
      'Original scheduled date in the recurrence; never changes, and decides whether ending the recurrence removes a planned occurrence.',
  })
  occurrenceDate!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-11-15',
    description:
      'Current date: the expected date of a planned occurrence, which may have been edited up to the end date of the recurrence, or the purchase date once a card charge is confirmed. A confirmed account occurrence keeps its expected date here and has its actual date in completedOn.',
  })
  date!: string;

  @ApiProperty({ example: '55.90' })
  amount!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: TransactionState })
  state!: TransactionState;

  @ApiProperty()
  stateLabel!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: null,
    description:
      'Actual payment or receipt date of an account occurrence, purchase date of a confirmed card charge; may be after the end date of the recurrence.',
  })
  completedOn!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Transaction of an account occurrence; null for cards and contributions.',
  })
  transactionUuid!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Purchase created when a card charge was confirmed.',
  })
  purchaseUuid!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Investment movement of a contribution occurrence; null otherwise.',
  })
  movementUuid!: string | null;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-12-01',
    description:
      'Card charges only: reference month of the expected invoice, or of the actual one once confirmed.',
  })
  invoiceMonth!: string | null;

  static fromDomain(
    occurrence: RecurrenceOccurrence,
    translate: (key: string) => string,
  ): RecurrenceOccurrenceResponseDto {
    return Object.assign(new RecurrenceOccurrenceResponseDto(), {
      ...occurrence,
      amount: formatMoney(occurrence.amount),
      stateLabel: transactionStateLabel(occurrence.state, translate),
    });
  }
}
