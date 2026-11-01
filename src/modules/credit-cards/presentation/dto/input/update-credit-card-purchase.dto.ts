import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  TransactionDescriptionField,
  TransactionNotesField,
  isPresent,
  isProvided,
} from '@modules/transactions/presentation';

export class UpdateCreditCardPurchaseDto {
  @ValidateIf(isProvided)
  @TransactionDescriptionField(false)
  description?: string;

  @ApiPropertyOptional({ description: 'An active expense category.' })
  @ValidateIf(isProvided)
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  categoryUuid?: string;

  @ValidateIf(isPresent)
  @TransactionNotesField()
  notes?: string | null;
}
