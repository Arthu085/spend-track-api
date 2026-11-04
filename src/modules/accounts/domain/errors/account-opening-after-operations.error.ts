import { ValidationError } from '@shared/domain/errors';

export class AccountOpeningAfterOperationsError extends ValidationError {
  constructor() {
    super('accounts.errors.opening_after_operations');
  }
}
