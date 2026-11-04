import { ConflictError } from '@shared/domain/errors';

export class InvestmentPendingOperationsDecisionRequiredError extends ConflictError {
  constructor() {
    super('investments.errors.pending_operations_decision_required');
  }
}
