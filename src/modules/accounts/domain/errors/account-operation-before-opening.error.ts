import { ValidationError } from '@shared/domain/errors';

export class AccountOperationBeforeOpeningError extends ValidationError {
  constructor() {
    super('accounts.errors.operation_before_opening');
  }
}
