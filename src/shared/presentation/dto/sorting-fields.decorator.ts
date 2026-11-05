import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { SORT_ORDERS } from '@shared/domain/sorting/list-sort';

export function SortByField(fields: readonly string[]): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({
      enum: [...fields],
      description: 'Sort field. Omit to preserve the default ordering.',
    }),
    IsOptional(),
    IsIn(fields, { message: i18nValidationMessage('validation.IS_ENUM') }),
  );
}

export function SortOrderField(): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({
      enum: [...SORT_ORDERS],
      description:
        'Sort direction. Defaults to ASC when sortBy is set; ignored otherwise.',
    }),
    IsOptional(),
    IsIn(SORT_ORDERS, {
      message: i18nValidationMessage('validation.IS_ENUM'),
    }),
  );
}
