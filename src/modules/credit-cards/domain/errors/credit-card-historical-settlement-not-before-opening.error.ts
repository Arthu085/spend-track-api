import { ValidationError } from '@shared/domain/errors';

export class CreditCardHistoricalSettlementNotBeforeOpeningError extends ValidationError {
  constructor() {
    super('credit_cards.errors.historical_settlement_not_before_opening');
  }
}
