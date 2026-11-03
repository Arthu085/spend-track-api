import { NotFoundError } from '@shared/domain/errors';

export class RecurrenceNotFoundError extends NotFoundError {
  constructor() {
    super('recurrences.errors.recurrence_not_found');
  }
}
