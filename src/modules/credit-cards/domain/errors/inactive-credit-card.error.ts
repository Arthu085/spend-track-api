import { InactiveRecordError } from '@shared/domain/errors';

export class InactiveCreditCardError extends InactiveRecordError {
  constructor() {
    super('credit_cards.errors.card_inactive');
  }
}
