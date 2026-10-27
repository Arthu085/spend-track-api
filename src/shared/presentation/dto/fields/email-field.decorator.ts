import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { EMAIL_MAX_LENGTH } from '@shared/domain/constraints';

export function EmailField(options: {
  example: string;
  required?: boolean;
}): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      example: options.example,
      maxLength: EMAIL_MAX_LENGTH,
      required: options.required ?? true,
    }),
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim() : value,
    ),
    IsEmail({}, { message: i18nValidationMessage('validation.IS_EMAIL') }),
    MaxLength(EMAIL_MAX_LENGTH, {
      message: i18nValidationMessage('validation.MAX_LENGTH'),
    }),
  );
}
