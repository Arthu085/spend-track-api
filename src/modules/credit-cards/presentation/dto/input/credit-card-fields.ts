import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  FINANCE_NAME_MAX_LENGTH,
  FINANCE_NAME_MIN_LENGTH,
  NON_BLANK_PATTERN,
} from '@shared/domain/constraints';
import { MoneyField } from '@shared/presentation/dto';

const NON_NEGATIVE_MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

export function CreditCardNameField(required = true): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      example: 'Nubank Mastercard',
      minLength: FINANCE_NAME_MIN_LENGTH,
      maxLength: FINANCE_NAME_MAX_LENGTH,
      pattern: NON_BLANK_PATTERN.source,
      required,
    }),
    IsString({ message: i18nValidationMessage('validation.IS_STRING') }),
    Matches(NON_BLANK_PATTERN, {
      message: i18nValidationMessage('validation.NOT_EMPTY'),
    }),
    MaxLength(FINANCE_NAME_MAX_LENGTH, {
      message: i18nValidationMessage('validation.MAX_LENGTH'),
    }),
  );
}

export function CreditLimitField(required = true): PropertyDecorator {
  return applyDecorators(
    MoneyField({
      example: '5000.00',
      required,
      description:
        'Non-negative credit limit in BRL as a decimal string; informational only, it never blocks a purchase.',
    }),
    Matches(NON_NEGATIVE_MONEY_PATTERN, {
      message: i18nValidationMessage('validation.IS_MONEY'),
    }),
  );
}

export function BillingDayField(
  description: string,
  required = true,
): PropertyDecorator {
  return applyDecorators(
    ApiProperty({ minimum: 1, maximum: 31, example: 5, description, required }),
    Type(() => Number),
    IsInt({ message: i18nValidationMessage('validation.IS_INT') }),
    Min(1, { message: i18nValidationMessage('validation.MIN') }),
    Max(31, { message: i18nValidationMessage('validation.MAX') }),
  );
}

export const CLOSING_DAY_DESCRIPTION =
  'Day of month the invoice closes, clamped to the last day of short months. Purchases from this day on go to the next invoice.';

export const DUE_DAY_DESCRIPTION =
  'Day of month the invoice is due, clamped to the last day of short months. The invoice is named after the month it is due in.';
