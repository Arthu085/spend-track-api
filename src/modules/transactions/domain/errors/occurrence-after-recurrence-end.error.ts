import { ValidationError } from '@shared/domain/errors';

export class OccurrenceAfterRecurrenceEndError extends ValidationError {
  constructor() {
    super('transactions.errors.occurrence_after_recurrence_end');
  }
}
