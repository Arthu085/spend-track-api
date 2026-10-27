import { NotFoundError } from '@shared/domain/errors';

export class UserChangeRequestNotFoundError extends NotFoundError {
  constructor() {
    super('users.errors.change_request_not_found');
  }
}
