import { ValidationError } from '@shared/domain/errors';

export class CreditCardRefundExceedsPurchaseError extends ValidationError {
  constructor() {
    super('credit_cards.errors.refund_exceeds_purchase');
  }
}
