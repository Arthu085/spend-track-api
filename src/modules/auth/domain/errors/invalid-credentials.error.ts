import { UnauthorizedError } from '@shared/domain/errors';

export class InvalidCredentialsError extends UnauthorizedError {
  constructor() {
    super('auth.errors.invalid_credentials');
  }
}
