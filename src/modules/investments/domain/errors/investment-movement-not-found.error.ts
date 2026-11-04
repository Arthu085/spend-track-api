import { NotFoundError } from '@shared/domain/errors';

export class InvestmentMovementNotFoundError extends NotFoundError {
  constructor() {
    super('investments.errors.movement_not_found');
  }
}
