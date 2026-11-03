import { ConflictError } from '@shared/domain/errors';

export class InvestmentMovementStateTransitionError extends ConflictError {
  constructor() {
    super('investments.errors.movement_state_transition');
  }
}
