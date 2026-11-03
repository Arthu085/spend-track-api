import { ValidationError } from '@shared/domain/errors';

export class CreditCardPurchaseCategoryKindError extends ValidationError {
  constructor() {
    super('credit_cards.errors.purchase_category_kind');
  }
}
