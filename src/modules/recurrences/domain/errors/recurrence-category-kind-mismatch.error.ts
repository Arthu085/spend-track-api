import { ValidationError } from '@shared/domain/errors';

export class RecurrenceCategoryKindMismatchError extends ValidationError {
  constructor() {
    super('recurrences.errors.category_kind_mismatch');
  }
}
