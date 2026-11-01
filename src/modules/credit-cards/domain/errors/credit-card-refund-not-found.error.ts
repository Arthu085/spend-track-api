import { NotFoundError } from '@shared/domain/errors';

export class CreditCardRefundNotFoundError extends NotFoundError {
  constructor() {
    super('credit_cards.errors.refund_not_found');
  }
}
