import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  Matches,
  MaxLength,
  registerDecorator,
  type ValidationArguments,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { NON_BLANK_PATTERN } from '@shared/domain/constraints';
import { MoneyField } from '@shared/presentation/dto';

export const TRANSACTION_DESCRIPTION_MAX_LENGTH = 150;
export const TRANSACTION_NOTES_MAX_LENGTH = 1000;

export const POSITIVE_MONEY_PATTERN =
  /^(?!0*(\.0{1,2})?$)\d{1,12}(\.\d{1,2})?$/;

export const isProvided = (_: object, value: unknown): boolean =>
  value !== undefined;

export const isPresent = (_: object, value: unknown): boolean =>
  value !== undefined && value !== null;

export function TransactionDescriptionField(
  required = true,
): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      example: 'Mercado',
      minLength: 1,
      maxLength: TRANSACTION_DESCRIPTION_MAX_LENGTH,
      pattern: NON_BLANK_PATTERN.source,
      required,
    }),
    IsString({ message: i18nValidationMessage('validation.IS_STRING') }),
    Matches(NON_BLANK_PATTERN, {
      message: i18nValidationMessage('validation.NOT_EMPTY'),
    }),
    MaxLength(TRANSACTION_DESCRIPTION_MAX_LENGTH, {
      message: i18nValidationMessage('validation.MAX_LENGTH'),
    }),
  );
}

export function TransactionAmountField(required = true): PropertyDecorator {
  return applyDecorators(
    MoneyField({
      example: '250.40',
      required,
      description:
        'Strictly positive decimal amount in BRL with up to 2 decimal places, sent as a string; the type gives its direction.',
    }),
    Matches(POSITIVE_MONEY_PATTERN, {
      message: i18nValidationMessage('validation.IS_POSITIVE_MONEY'),
    }),
  );
}

export function TransactionNotesField(): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      type: String,
      nullable: true,
      required: false,
      maxLength: TRANSACTION_NOTES_MAX_LENGTH,
      description: 'Optional notes; null clears them.',
    }),
    IsString({ message: i18nValidationMessage('validation.IS_STRING') }),
    MaxLength(TRANSACTION_NOTES_MAX_LENGTH, {
      message: i18nValidationMessage('validation.MAX_LENGTH'),
    }),
  );
}

export function AllowedOnlyWhen<T extends object>(
  condition: (dto: T) => boolean,
): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'allowedOnlyWhen',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: i18nValidationMessage('validation.NOT_ALLOWED') },
      validator: {
        validate: (value: unknown, args: ValidationArguments): boolean =>
          value === undefined || value === null || condition(args.object as T),
      },
    });
  };
}
