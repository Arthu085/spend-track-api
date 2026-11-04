import { ConflictError } from '@shared/domain/errors';

export class InvestmentHasHistoryError extends ConflictError {
  constructor() {
    super('investments.errors.has_history');
  }
}
