import { ValidateIf } from 'class-validator';
import {
  TransactionAmountField,
  TransactionNotesField,
  isPresent,
} from '@modules/transactions/presentation';
import { DateOnlyField } from '@shared/presentation/dto';

export class CreateCreditCardRefundDto {
  @TransactionAmountField()
  amount!: string;

  @DateOnlyField({ example: '2026-11-03' })
  date!: string;

  @ValidateIf(isPresent)
  @TransactionNotesField()
  notes?: string | null;
}
