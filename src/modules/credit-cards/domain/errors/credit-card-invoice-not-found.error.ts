import { NotFoundError } from '@shared/domain/errors';

export class CreditCardInvoiceNotFoundError extends NotFoundError {
  constructor() {
    super('credit_cards.errors.invoice_not_found');
  }
}
