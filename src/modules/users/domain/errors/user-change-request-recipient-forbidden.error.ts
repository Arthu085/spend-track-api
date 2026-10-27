import { ForbiddenError } from '@shared/domain/errors';

export class UserChangeRequestRecipientForbiddenError extends ForbiddenError {
  constructor() {
    super('users.errors.change_request_recipient_forbidden');
  }
}
