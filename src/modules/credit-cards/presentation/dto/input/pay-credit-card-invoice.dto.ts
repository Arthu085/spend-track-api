import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  TransactionAmountField,
  isPresent,
} from '@modules/transactions/presentation';
import { DateOnlyField } from '@shared/presentation/dto';

export class PayCreditCardInvoiceDto {
  @ApiProperty({ description: 'An active account of yours the money leaves.' })
  @IsUUID(undefined, { message: i18nValidationMessage('validation.IS_UUID') })
  accountUuid!: string;

  @TransactionAmountField()
  amount!: string;

  @ValidateIf(isPresent)
  @DateOnlyField({ example: '2026-11-10', required: false })
  paidOn?: string;
}
