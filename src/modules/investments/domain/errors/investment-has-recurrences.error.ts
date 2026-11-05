import { ConflictError } from '@shared/domain/errors';

export class InvestmentHasRecurrencesError extends ConflictError {
  constructor() {
    super('investments.errors.has_recurrences');
  }
}
