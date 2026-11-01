import { ConflictError } from '@shared/domain/errors';

export class TransactionStateTransitionError extends ConflictError {
  constructor() {
    super('transactions.errors.state_transition');
  }
}
