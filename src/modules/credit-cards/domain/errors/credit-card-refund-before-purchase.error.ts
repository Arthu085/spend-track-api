import { ValidationError } from '@shared/domain/errors';

export class CreditCardRefundBeforePurchaseError extends ValidationError {
  constructor() {
    super('credit_cards.errors.refund_before_purchase');
  }
}
