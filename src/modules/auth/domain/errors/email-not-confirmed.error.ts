import { ForbiddenError } from '@shared/domain/errors';

export class EmailNotConfirmedError extends ForbiddenError {
  constructor() {
    super('auth.errors.email_not_confirmed');
  }
}
