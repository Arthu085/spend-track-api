import { ForbiddenError } from '@shared/domain/errors';

export class GlobalTransactionCategoryReadOnlyError extends ForbiddenError {
  constructor() {
    super('transaction_categories.errors.global_read_only');
  }
}
