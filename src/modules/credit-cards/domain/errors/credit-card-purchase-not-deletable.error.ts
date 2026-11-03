import { ConflictError } from '@shared/domain/errors';

export class CreditCardPurchaseNotDeletableError extends ConflictError {
  constructor() {
    super('credit_cards.errors.purchase_not_deletable');
  }
}
