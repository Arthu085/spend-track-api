import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { isProvided } from '@modules/transactions/presentation';
import {
  BillingDayField,
  CLOSING_DAY_DESCRIPTION,
  CreditCardNameField,
  CreditLimitField,
  DUE_DAY_DESCRIPTION,
} from './credit-card-fields';

export class UpdateCreditCardDto {
  @ValidateIf(isProvided)
  @CreditCardNameField(false)
  name?: string;

  @ValidateIf(isProvided)
  @CreditLimitField(false)
  creditLimit?: string;

  @ValidateIf(isProvided)
  @BillingDayField(
    `${CLOSING_DAY_DESCRIPTION} Applies to invoices created from now on; existing invoices keep their dates.`,
    false,
  )
  closingDay?: number;

  @ValidateIf(isProvided)
  @BillingDayField(
    `${DUE_DAY_DESCRIPTION} Applies to invoices created from now on; existing invoices keep their dates.`,
    false,
  )
  dueDay?: number;

  @ApiPropertyOptional({
    description:
      'true makes this the default card, replacing the previous one; false leaves the user without a default.',
  })
  @ValidateIf(isProvided)
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  isDefault?: boolean;
}
