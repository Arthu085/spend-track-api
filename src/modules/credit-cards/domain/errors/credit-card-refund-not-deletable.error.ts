import { ConflictError } from '@shared/domain/errors';

export class CreditCardRefundNotDeletableError extends ConflictError {
  constructor() {
    super('credit_cards.errors.refund_not_deletable');
  }
}
