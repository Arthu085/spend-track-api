import { ValidationError } from '@shared/domain/errors';

export class CreditCardInstallmentsExceedAmountError extends ValidationError {
  constructor() {
    super('credit_cards.errors.installments_exceed_amount');
  }
}
