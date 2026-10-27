import { UnauthorizedError } from '@shared/domain/errors';

export class InvalidRefreshTokenError extends UnauthorizedError {
  constructor() {
    super('auth.errors.invalid_refresh_token');
  }
}
