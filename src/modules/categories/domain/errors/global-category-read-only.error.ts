import { ForbiddenError } from '@shared/domain/errors';

export class GlobalCategoryReadOnlyError extends ForbiddenError {
  constructor() {
    super('categories.errors.global_read_only');
  }
}
