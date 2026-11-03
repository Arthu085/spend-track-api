import { ValidationError } from '@shared/domain/errors';

export class InvestmentValuationUnchangedError extends ValidationError {
  constructor() {
    super('investments.errors.valuation_unchanged');
  }
}
