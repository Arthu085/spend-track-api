import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { TransactionCategoryKind } from '../../../domain/enums/transaction-category-kind.enum';
import {
  TransactionCategoryColorField,
  TransactionCategoryNameField,
} from './transaction-category-fields';

export class CreateTransactionCategoryDto {
  @TransactionCategoryNameField()
  name!: string;

  @ApiProperty({
    enum: TransactionCategoryKind,
    description: 'Transaction type the category applies to; cannot change.',
  })
  @IsEnum(TransactionCategoryKind, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  kind!: TransactionCategoryKind;

  @IsOptional()
  @TransactionCategoryColorField()
  color?: string;
}
