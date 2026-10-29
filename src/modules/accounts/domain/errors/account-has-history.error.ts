import { ConflictError } from '@shared/domain/errors';

export class AccountHasHistoryError extends ConflictError {
  constructor() {
    super('accounts.errors.has_history');
  }
}
