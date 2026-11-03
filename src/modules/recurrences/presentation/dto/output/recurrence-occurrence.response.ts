import { ApiProperty } from '@nestjs/swagger';
import { TransactionState } from '@modules/transactions';
import { transactionStateLabel } from '@modules/transactions/presentation';
import { formatMoney } from '@shared/domain/money';
import type { RecurrenceOccurrence } from '../../../application/services/recurrence-occurrence';

export class RecurrenceOccurrenceResponseDto {
  @ApiProperty({
    description:
      'Uuid of the occurrence: the transaction of an account recurrence, the charge of a card recurrence.',
  })
  uuid!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-11-15',
    description: 'Scheduled date in the recurrence; never changes.',
  })
  occurrenceDate!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-11-15',
    description:
      'Current date: the edited planned date, or the purchase date once a card charge is confirmed.',
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
      'Payment or receipt date of an account occurrence, purchase date of a confirmed card charge.',
  })
  completedOn!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Transaction of an account occurrence; null for cards.',
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
