import { NotFoundError } from '@shared/domain/errors';

export class CreditCardPurchaseNotFoundError extends NotFoundError {
  constructor() {
    super('credit_cards.errors.purchase_not_found');
  }
}
