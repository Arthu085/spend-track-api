import { NotFoundError } from '@shared/domain/errors';

export class TransactionCategoryNotFoundError extends NotFoundError {
  constructor() {
    super('transaction_categories.errors.not_found');
  }
}
