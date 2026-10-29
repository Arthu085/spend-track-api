import { ValidateIf } from 'class-validator';
import {
  TransactionCategoryColorField,
  TransactionCategoryNameField,
} from './transaction-category-fields';

const isProvided = (_: object, value: unknown): boolean => value !== undefined;

export class UpdateTransactionCategoryDto {
  @ValidateIf(isProvided)
  @TransactionCategoryNameField(false)
  name?: string;

  @ValidateIf(isProvided)
  @TransactionCategoryColorField()
  color?: string;
}
