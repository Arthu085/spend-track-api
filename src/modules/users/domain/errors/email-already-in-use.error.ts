import { ConflictError } from '@shared/domain/errors';

export class EmailAlreadyInUseError extends ConflictError {
  constructor() {
    super('users.errors.email_already_in_use');
  }
}
