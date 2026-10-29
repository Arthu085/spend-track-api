import { NotFoundError } from '@shared/domain/errors';

export class CategoryNotFoundError extends NotFoundError {
  constructor() {
    super('categories.errors.not_found');
  }
}
