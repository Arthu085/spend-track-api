import { ValidationError } from '@shared/domain/errors';

export class AccountOpeningNotAfterHistoricalEntriesError extends ValidationError {
  constructor() {
    super('accounts.errors.opening_not_after_historical_entries');
  }
}
