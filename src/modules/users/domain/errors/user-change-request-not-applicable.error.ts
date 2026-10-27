import { ConflictError } from '@shared/domain/errors';

export class UserChangeRequestNotApplicableError extends ConflictError {
  constructor() {
    super('users.errors.change_request_not_applicable');
  }
}
