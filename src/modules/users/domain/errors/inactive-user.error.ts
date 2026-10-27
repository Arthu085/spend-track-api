import { InactiveRecordError } from '@shared/domain/errors';

export class InactiveUserError extends InactiveRecordError {
  constructor() {
    super('users.errors.inactive');
  }
}
