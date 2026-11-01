import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  BillingDayField,
  CLOSING_DAY_DESCRIPTION,
  CreditCardNameField,
  CreditLimitField,
  DUE_DAY_DESCRIPTION,
} from './credit-card-fields';

export class CreateCreditCardDto {
  @CreditCardNameField()
  name!: string;

  @CreditLimitField()
  creditLimit!: string;

  @BillingDayField(CLOSING_DAY_DESCRIPTION)
  closingDay!: number;

  @BillingDayField(DUE_DAY_DESCRIPTION)
  dueDay!: number;

  @ApiPropertyOptional({
    default: false,
    description: 'Makes this the default card, replacing the previous one.',
  })
  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  isDefault?: boolean;
}
