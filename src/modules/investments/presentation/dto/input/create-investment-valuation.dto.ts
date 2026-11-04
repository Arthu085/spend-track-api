import { Matches, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { isPresent } from '@modules/transactions/presentation';
import { DateOnlyField, MoneyField } from '@shared/presentation/dto';
import { NON_NEGATIVE_MONEY_PATTERN } from './investment-fields';

export class CreateInvestmentValuationDto {
  @MoneyField({
    example: '10250.37',
    description:
      'New current value of the investment in BRL, non-negative; the difference from the current value is recorded as a valuation adjustment.',
  })
  @Matches(NON_NEGATIVE_MONEY_PATTERN, {
    message: i18nValidationMessage('validation.IS_MONEY'),
  })
  value!: string;

  @ValidateIf(isPresent)
  @DateOnlyField({ example: '2026-11-03', required: false })
  date?: string;
}
