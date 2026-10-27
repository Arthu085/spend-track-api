import { ConflictError } from '@shared/domain/errors';

export class UserChangeRequestNotPendingError extends ConflictError {
  constructor() {
    super('users.errors.change_request_not_pending');
  }
}
