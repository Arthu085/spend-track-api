import { ConflictError } from '@shared/domain/errors';

export class CreditCardHasHistoryError extends ConflictError {
  constructor() {
    super('credit_cards.errors.card_has_history');
  }
}
