import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

const DEFAULT_MAX_LENGTH = 255;

export function TextFilterField(options?: {
  maxLength?: number;
}): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({
      description: 'Case-insensitive partial match.',
    }),
    IsOptional(),
    IsString({ message: i18nValidationMessage('validation.IS_STRING') }),
    MaxLength(options?.maxLength ?? DEFAULT_MAX_LENGTH, {
      message: i18nValidationMessage('validation.MAX_LENGTH'),
    }),
  );
}
