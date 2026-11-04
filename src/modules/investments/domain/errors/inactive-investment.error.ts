import { InactiveRecordError } from '@shared/domain/errors';

export class InactiveInvestmentError extends InactiveRecordError {
  constructor() {
    super('investments.errors.inactive');
  }
}
