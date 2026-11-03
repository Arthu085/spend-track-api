import { ValidationError } from '@shared/domain/errors';

export class CreditCardPaymentExceedsOutstandingError extends ValidationError {
  constructor() {
    super('credit_cards.errors.payment_exceeds_outstanding');
  }
}
