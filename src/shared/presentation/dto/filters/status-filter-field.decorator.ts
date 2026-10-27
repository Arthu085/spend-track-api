import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';

export function StatusFilterField(): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({
      enum: RecordStatus,
      description: 'Filter by record status (exact match).',
    }),
    IsOptional(),
    IsEnum(RecordStatus, {
      message: i18nValidationMessage('validation.IS_ENUM'),
    }),
  );
}
