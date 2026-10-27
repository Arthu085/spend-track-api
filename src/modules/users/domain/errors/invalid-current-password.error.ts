import { ForbiddenError } from '@shared/domain/errors';

export class InvalidCurrentPasswordError extends ForbiddenError {
  constructor() {
    super('users.errors.invalid_current_password');
  }
}
