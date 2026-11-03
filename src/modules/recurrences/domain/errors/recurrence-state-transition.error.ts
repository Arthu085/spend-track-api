import { ConflictError } from '@shared/domain/errors';

export class RecurrenceStateTransitionError extends ConflictError {
  constructor() {
    super('recurrences.errors.state_transition');
  }
}
