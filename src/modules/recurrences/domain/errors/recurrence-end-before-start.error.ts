import { ValidationError } from '@shared/domain/errors';

export class RecurrenceEndBeforeStartError extends ValidationError {
  constructor() {
    super('recurrences.errors.end_before_start');
  }
}
