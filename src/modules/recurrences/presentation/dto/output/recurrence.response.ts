import { ApiProperty } from '@nestjs/swagger';
import { CreditCardRefResponseDto } from '@modules/credit-cards/presentation';
import {
  TransactionAccountResponseDto,
  TransactionCategoryRefResponseDto,
} from '@modules/transactions/presentation';
import { formatMoney } from '@shared/domain/money';
import { translateOrFallback } from '@shared/presentation/http';
import { RecurrenceEntity } from '../../../domain/entities/recurrence.entity';
import { RecurrenceFrequency } from '../../../domain/enums/recurrence-frequency.enum';
import { RecurrenceState } from '../../../domain/enums/recurrence-state.enum';
import { RecurrenceType } from '../../../domain/enums/recurrence-type.enum';

export class RecurrenceResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({ enum: RecurrenceType })
  type!: RecurrenceType;

  @ApiProperty()
  typeLabel!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({
    example: '55.90',
    description: 'Expected amount copied to new occurrences.',
  })
  amount!: string;

  @ApiProperty({ enum: RecurrenceFrequency })
  frequency!: RecurrenceFrequency;

  @ApiProperty()
  frequencyLabel!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-11-15' })
  startDate!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: null,
    description: 'Last date an occurrence may fall on; null when open-ended.',
  })
  endDate!: string | null;

  @ApiProperty({
    enum: RecurrenceState,
    description:
      'ENDED when the recurrence was ended as a whole or its end date has passed. It describes the recurrence only: the planned occurrences it kept can still be edited, confirmed, or canceled.',
  })
  state!: RecurrenceState;

  @ApiProperty()
  stateLabel!: string;

  @ApiProperty({
    type: TransactionAccountResponseDto,
    nullable: true,
    description: 'Account of the generated transactions; null for cards.',
  })
  account!: TransactionAccountResponseDto | null;

  @ApiProperty({
    type: CreditCardRefResponseDto,
    nullable: true,
    description: 'Card of the generated charges; null for accounts.',
  })
  creditCard!: CreditCardRefResponseDto | null;

  @ApiProperty({ type: TransactionCategoryRefResponseDto })
  category!: TransactionCategoryRefResponseDto;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-12-15',
    description:
      "Next scheduled date from today on, never before the account's opening date; null when the recurrence is not active or has no further date.",
  })
  nextOccurrenceDate!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromDomain(
    recurrence: RecurrenceEntity,
    today: string,
    translate: (key: string) => string,
  ): RecurrenceResponseDto {
    const dto = new RecurrenceResponseDto();
    const state = recurrence.stateOn(today);

    dto.uuid = recurrence.uuid;
    dto.type = recurrence.type;
    dto.typeLabel = translateOrFallback(
      translate,
      `transactions.type.${recurrence.type.toLowerCase()}`,
      recurrence.type,
    );
    dto.description = recurrence.description;
    dto.amount = formatMoney(recurrence.amount);
    dto.frequency = recurrence.frequency;
    dto.frequencyLabel = translateOrFallback(
      translate,
      `recurrences.frequency.${recurrence.frequency.toLowerCase()}`,
      recurrence.frequency,
    );
    dto.startDate = recurrence.startDate;
    dto.endDate = recurrence.endDate;
    dto.state = state;
    dto.stateLabel = translateOrFallback(
      translate,
      `recurrences.state.${state.toLowerCase()}`,
      state,
    );
    dto.account = recurrence.account
      ? TransactionAccountResponseDto.fromDomain(recurrence.account)
      : null;
    dto.creditCard = recurrence.creditCard
      ? CreditCardRefResponseDto.fromDomain(recurrence.creditCard)
      : null;
    dto.category = TransactionCategoryRefResponseDto.fromDomain(
      recurrence.category,
      translate,
    );
    dto.notes = recurrence.notes;
    dto.nextOccurrenceDate = recurrence.nextOccurrenceDate(today);
    dto.createdAt = recurrence.createdAt;
    dto.updatedAt = recurrence.updatedAt;

    return dto;
  }
}
