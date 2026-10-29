import { ValidationError } from '@shared/domain/errors';

export class TransferSameAccountError extends ValidationError {
  constructor() {
    super('transactions.errors.transfer_same_account');
  }
}
