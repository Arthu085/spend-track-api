import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  DateOnlyField,
  PaginationQueryDto,
  TextFilterField,
  UuidFilterField,
} from '@shared/presentation/dto';
import { TransactionState } from '../../../domain/enums/transaction-state.enum';
import { TransactionType } from '../../../domain/enums/transaction-type.enum';
import {
  TRANSACTION_DESCRIPTION_MAX_LENGTH,
  isProvided,
} from './transaction-fields';

export class ListTransactionsQueryDto extends PaginationQueryDto {
  @ValidateIf(isProvided)
  @DateOnlyField({ example: '2026-10-01', required: false })
  from?: string;

  @ValidateIf(isProvided)
  @DateOnlyField({ example: '2026-10-31', required: false })
  to?: string;

  @ApiPropertyOptional({
    enum: TransactionType,
    description: 'Filter by type (exact match).',
  })
  @IsOptional()
  @IsEnum(TransactionType, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  type?: TransactionType;

  @ApiPropertyOptional({
    enum: TransactionState,
    description:
      'Filter by state (exact match); CANCELED is included unless filtered out.',
  })
  @IsOptional()
  @IsEnum(TransactionState, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  state?: TransactionState;

  @UuidFilterField(
    'Transactions whose source or destination is this account; an unknown account matches nothing.',
  )
  accountUuid?: string;

  @UuidFilterField(
    'Transactions in this category; an unknown category matches nothing.',
  )
  categoryUuid?: string;

  @TextFilterField({ maxLength: TRANSACTION_DESCRIPTION_MAX_LENGTH })
  description?: string;
}
