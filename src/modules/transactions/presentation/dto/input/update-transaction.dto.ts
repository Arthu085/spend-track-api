import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { DateOnlyField } from '@shared/presentation/dto';
import {
  TransactionAmountField,
  TransactionDescriptionField,
  TransactionNotesField,
  isPresent,
  isProvided,
} from './transaction-fields';

export class UpdateTransactionDto {
  @ValidateIf(isProvided)
  @TransactionDescriptionField(false)
  description?: string;

  @ValidateIf(isProvided)
  @TransactionAmountField(false)
  amount?: string;

  @ValidateIf(isProvided)
  @DateOnlyField({ example: '2026-10-29', required: false })
  date?: string;

  @ApiPropertyOptional()
  @ValidateIf(isProvided)
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  accountUuid?: string;

  @ApiPropertyOptional({ description: 'TRANSFER only.' })
  @ValidateIf(isProvided)
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  destinationAccountUuid?: string;

  @ApiPropertyOptional({ description: 'INCOME and EXPENSE only.' })
  @ValidateIf(isProvided)
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  categoryUuid?: string;

  @ValidateIf(isPresent)
  @TransactionNotesField()
  notes?: string | null;
}
