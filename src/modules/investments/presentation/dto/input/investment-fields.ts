import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Matches, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { POSITIVE_MONEY_PATTERN } from '@modules/transactions/presentation';
import {
  FINANCE_NAME_MAX_LENGTH,
  FINANCE_NAME_MIN_LENGTH,
  NON_BLANK_PATTERN,
} from '@shared/domain/constraints';
import { MoneyField } from '@shared/presentation/dto';
import { InvestmentType } from '../../../domain/enums/investment-type.enum';

export const NON_NEGATIVE_MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

export function InvestmentNameField(required = true): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      example: 'Reserva de emergência',
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

export function InvestmentTypeField(required = true): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      enum: InvestmentType,
      required,
      description:
        'INVESTMENT, RESERVE, or GOAL; only changes how it is grouped and shown.',
    }),
    IsEnum(InvestmentType, {
      message: i18nValidationMessage('validation.IS_ENUM'),
    }),
  );
}

export function InvestmentTargetAmountField(): PropertyDecorator {
  return applyDecorators(
    MoneyField({
      example: '10000.00',
      required: false,
      description:
        'Optional strictly positive target value in BRL used to follow progress; null removes it.',
    }),
    Matches(POSITIVE_MONEY_PATTERN, {
      message: i18nValidationMessage('validation.IS_POSITIVE_MONEY'),
    }),
  );
}
