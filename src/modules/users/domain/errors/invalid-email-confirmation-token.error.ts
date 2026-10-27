import { ValidationError } from '@shared/domain/errors';

export class InvalidEmailConfirmationTokenError extends ValidationError {
  constructor() {
    super('users.errors.invalid_confirmation_token');
  }
}
