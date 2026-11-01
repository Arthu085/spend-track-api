import { NotFoundError } from '@shared/domain/errors';

export class CreditCardNotFoundError extends NotFoundError {
  constructor() {
    super('credit_cards.errors.card_not_found');
  }
}
