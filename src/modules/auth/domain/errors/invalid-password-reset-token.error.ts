import { ValidationError } from '@shared/domain/errors';

export class InvalidPasswordResetTokenError extends ValidationError {
  constructor() {
    super('auth.errors.invalid_password_reset_token');
  }
}
