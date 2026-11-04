import { NotFoundError } from '@shared/domain/errors';

export class InvestmentNotFoundError extends NotFoundError {
  constructor() {
    super('investments.errors.not_found');
  }
}
