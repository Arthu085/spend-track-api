import { ValidationError } from '@shared/domain/errors';

export class CompletedAdditionalContributionInFutureError extends ValidationError {
  constructor() {
    super('recurrences.errors.completed_additional_contribution_in_future');
  }
}
