import { ValidationError } from '@shared/domain/errors';

export class InvalidTransactionReferencesError extends ValidationError {
  constructor() {
    super('transactions.errors.invalid_references');
  }
}
