import { ValidationError } from '@shared/domain/errors';

export class InvalidRecurrenceTargetError extends ValidationError {
  constructor() {
    super('recurrences.errors.invalid_target');
  }
}
