import { ConflictError } from '@shared/domain/errors';

export class CreditCardHistoricalSettlementDuplicateError extends ConflictError {
  constructor() {
    super('credit_cards.errors.historical_settlement_duplicate');
  }
}
