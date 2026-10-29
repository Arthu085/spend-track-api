import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { MONEY_DECIMAL_PATTERN } from '@shared/domain/money';

export function MoneyField(options: {
  example: string;
  required?: boolean;
  description?: string;
}): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      type: String,
      example: options.example,
      pattern: MONEY_DECIMAL_PATTERN.source,
      required: options.required ?? true,
      description:
        options.description ??
        'Decimal amount in BRL with up to 2 decimal places, sent as a string.',
    }),
    IsString({ message: i18nValidationMessage('validation.IS_STRING') }),
    Matches(MONEY_DECIMAL_PATTERN, {
      message: i18nValidationMessage('validation.IS_MONEY'),
    }),
  );
}
