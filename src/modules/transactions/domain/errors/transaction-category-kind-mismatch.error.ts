import { ValidationError } from '@shared/domain/errors';

export class TransactionCategoryKindMismatchError extends ValidationError {
  constructor() {
    super('transactions.errors.category_kind_mismatch');
  }
}
