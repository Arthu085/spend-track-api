import { UnauthorizedError } from '@shared/domain/errors';

export class UserInactiveError extends UnauthorizedError {
  constructor() {
    super('auth.errors.user_inactive');
  }
}
