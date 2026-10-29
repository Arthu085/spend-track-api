import { NotFoundError } from '@shared/domain/errors';

export class AccountNotFoundError extends NotFoundError {
  constructor() {
    super('accounts.errors.not_found');
  }
}
