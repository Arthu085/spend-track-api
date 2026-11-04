import { ValidationError } from '@shared/domain/errors';

export class InvestmentInsufficientValueError extends ValidationError {
  constructor() {
    super('investments.errors.insufficient_value');
  }
}
