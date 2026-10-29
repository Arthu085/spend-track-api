import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  PaginationQueryDto,
  StatusFilterField,
} from '@shared/presentation/dto';
import { TransactionCategoryKind } from '../../../domain/enums/transaction-category-kind.enum';
import { TransactionCategoryScope } from '../../../domain/enums/transaction-category-scope.enum';

export class ListTransactionCategoriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: TransactionCategoryKind,
    description: 'Filter by transaction type (exact match).',
  })
  @IsOptional()
  @IsEnum(TransactionCategoryKind, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  kind?: TransactionCategoryKind;

  @ApiPropertyOptional({
    enum: TransactionCategoryScope,
    description: 'GLOBAL for the shared catalog, PERSONAL for your own.',
  })
  @IsOptional()
  @IsEnum(TransactionCategoryScope, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  scope?: TransactionCategoryScope;

  @StatusFilterField()
  status?: RecordStatus;
}
