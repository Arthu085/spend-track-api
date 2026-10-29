import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  PaginationQueryDto,
  StatusFilterField,
} from '@shared/presentation/dto';
import { CategoryKind } from '../../../domain/enums/category-kind.enum';
import { CategoryScope } from '../../../domain/enums/category-scope.enum';

export class ListCategoriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: CategoryKind,
    description: 'Filter by transaction type (exact match).',
  })
  @IsOptional()
  @IsEnum(CategoryKind, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  kind?: CategoryKind;

  @ApiPropertyOptional({
    enum: CategoryScope,
    description: 'GLOBAL for the shared catalog, PERSONAL for your own.',
  })
  @IsOptional()
  @IsEnum(CategoryScope, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  scope?: CategoryScope;

  @StatusFilterField()
  status?: RecordStatus;
}
