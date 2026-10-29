import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsString, Matches } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ISO_DATE_PATTERN } from '@shared/domain/constraints';

export function DateOnlyField(options: {
  example: string;
  required?: boolean;
}): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      type: String,
      format: 'date',
      example: options.example,
      required: options.required ?? true,
    }),
    IsString({ message: i18nValidationMessage('validation.IS_STRING') }),
    Matches(ISO_DATE_PATTERN, {
      message: i18nValidationMessage('validation.IS_DATE'),
    }),
    IsISO8601(
      { strict: true },
      { message: i18nValidationMessage('validation.IS_DATE') },
    ),
  );
}
