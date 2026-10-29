import { InactiveRecordError } from '@shared/domain/errors';

export class InactiveCategoryError extends InactiveRecordError {
  constructor() {
    super('categories.errors.inactive');
  }
}
