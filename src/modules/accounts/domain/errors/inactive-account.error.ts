import { InactiveRecordError } from '@shared/domain/errors';

export class InactiveAccountError extends InactiveRecordError {
  constructor() {
    super('accounts.errors.inactive');
  }
}
