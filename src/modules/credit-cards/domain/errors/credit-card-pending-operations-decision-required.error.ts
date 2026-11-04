import { ConflictError } from '@shared/domain/errors';

export class CreditCardPendingOperationsDecisionRequiredError extends ConflictError {
  constructor() {
    super('credit_cards.errors.pending_operations_decision_required');
  }
}
