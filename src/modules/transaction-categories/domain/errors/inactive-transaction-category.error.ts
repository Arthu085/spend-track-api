import { InactiveRecordError } from '@shared/domain/errors';

export class InactiveTransactionCategoryError extends InactiveRecordError {
  constructor() {
    super('transaction_categories.errors.inactive');
  }
}
