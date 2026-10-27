import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export function UuidFilterField(description: string): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({ description }),
    IsOptional(),
    IsUUID(undefined, {
      message: i18nValidationMessage('validation.IS_UUID'),
    }),
  );
}
