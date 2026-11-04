import { ValidateIf } from 'class-validator';
import {
  TransactionAmountField,
  isPresent,
} from '@modules/transactions/presentation';
import { DateOnlyField } from '@shared/presentation/dto';

export class RecurrenceOccurrenceScheduleDto {
  @ValidateIf(isPresent)
  @TransactionAmountField(false)
  amount?: string;

  @ValidateIf(isPresent)
  @DateOnlyField({
    example: '2026-11-16',
    required: false,
    description:
      'Edit: new expected date of the planned occurrence, not past the end date of the recurrence. Confirmation: actual payment or receipt date of an account occurrence (default today), actual purchase date of a card charge (default its date); either may be after the end date of the recurrence.',
  })
  date?: string;
}
