import { ConflictError } from '@shared/domain/errors';

export class RecurrenceEndedError extends ConflictError {
  constructor() {
    super('recurrences.errors.recurrence_ended');
  }
}
