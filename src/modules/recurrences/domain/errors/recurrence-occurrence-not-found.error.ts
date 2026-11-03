import { NotFoundError } from '@shared/domain/errors';

export class RecurrenceOccurrenceNotFoundError extends NotFoundError {
  constructor() {
    super('recurrences.errors.occurrence_not_found');
  }
}
