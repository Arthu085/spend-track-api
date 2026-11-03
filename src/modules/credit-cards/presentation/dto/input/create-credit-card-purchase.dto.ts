import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  TransactionAmountField,
  TransactionDescriptionField,
  TransactionNotesField,
  isPresent,
} from '@modules/transactions/presentation';
import { DateOnlyField } from '@shared/presentation/dto';

export const MAX_INSTALLMENTS = 48;

export class CreateCreditCardPurchaseDto {
  @ApiProperty({ description: 'An active card of yours.' })
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  cardUuid!: string;

  @ApiProperty({ description: 'An active expense category visible to you.' })
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  categoryUuid!: string;

  @TransactionDescriptionField()
  description!: string;

  @TransactionAmountField()
  amount!: string;

  @DateOnlyField({ example: '2026-10-29' })
  purchaseDate!: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_INSTALLMENTS,
    default: 1,
    description:
      'Number of monthly installments; they add up to amount, the first one absorbing the rounding remainder.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.IS_INT') })
  @Min(1, { message: i18nValidationMessage('validation.MIN') })
  @Max(MAX_INSTALLMENTS, { message: i18nValidationMessage('validation.MAX') })
  installmentCount?: number;

  @ValidateIf(isPresent)
  @TransactionNotesField()
  notes?: string | null;
}
