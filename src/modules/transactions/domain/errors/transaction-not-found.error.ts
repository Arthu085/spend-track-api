import { NotFoundError } from '@shared/domain/errors';

export class TransactionNotFoundError extends NotFoundError {
  constructor() {
    super('transactions.errors.not_found');
  }
}
