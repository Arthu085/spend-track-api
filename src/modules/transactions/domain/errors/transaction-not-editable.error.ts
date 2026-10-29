import { ConflictError } from '@shared/domain/errors';

export class TransactionNotEditableError extends ConflictError {
  constructor() {
    super('transactions.errors.not_editable');
  }
}
