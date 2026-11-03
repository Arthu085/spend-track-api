import { ConflictError } from '@shared/domain/errors';

export class RecurrenceOccurrenceNotPlannedError extends ConflictError {
  constructor() {
    super('recurrences.errors.occurrence_not_planned');
  }
}
