import { ValidationError } from '@shared/domain/errors';

export class RecurrenceInvoiceEndNotApplicableError extends ValidationError {
  constructor() {
    super('recurrences.errors.invoice_end_not_applicable');
  }
}
