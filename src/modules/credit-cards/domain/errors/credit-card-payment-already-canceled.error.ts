import { ConflictError } from '@shared/domain/errors';

export class CreditCardPaymentAlreadyCanceledError extends ConflictError {
  constructor() {
    super('credit_cards.errors.payment_already_canceled');
  }
}
