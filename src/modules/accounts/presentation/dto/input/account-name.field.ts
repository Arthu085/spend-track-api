import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  FINANCE_NAME_MAX_LENGTH,
  FINANCE_NAME_MIN_LENGTH,
  NON_BLANK_PATTERN,
} from '@shared/domain/constraints';

export function AccountNameField(required = true): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      example: 'Nubank',
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
