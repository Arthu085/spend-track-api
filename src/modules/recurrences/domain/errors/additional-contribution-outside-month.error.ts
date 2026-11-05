import { ValidationError } from '@shared/domain/errors';

export class AdditionalContributionOutsideMonthError extends ValidationError {
  constructor() {
    super('recurrences.errors.additional_contribution_outside_month');
  }
}
