import { NotFoundError } from '@shared/domain/errors';

export class CreditCardPaymentNotFoundError extends NotFoundError {
  constructor() {
    super('credit_cards.errors.payment_not_found');
  }
}
