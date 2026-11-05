import { ConflictError } from '@shared/domain/errors';

export class AccountHasRecurrencesError extends ConflictError {
  constructor() {
    super('accounts.errors.has_recurrences');
  }
}
