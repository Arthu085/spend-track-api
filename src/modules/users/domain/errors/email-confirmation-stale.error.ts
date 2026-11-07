import { ConflictError } from '@shared/domain/errors';

export class EmailConfirmationStaleError extends ConflictError {
  constructor() {
    super('users.errors.email_confirmation_stale');
  }
}
