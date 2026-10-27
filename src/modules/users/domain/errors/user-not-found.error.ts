import { NotFoundError } from '@shared/domain/errors';

export class UserNotFoundError extends NotFoundError {
  constructor() {
    super('users.errors.not_found');
  }
}
