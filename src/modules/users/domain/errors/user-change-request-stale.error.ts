import { ConflictError } from '@shared/domain/errors';

export class UserChangeRequestStaleError extends ConflictError {
  constructor() {
    super('users.errors.change_request_stale');
  }
}
