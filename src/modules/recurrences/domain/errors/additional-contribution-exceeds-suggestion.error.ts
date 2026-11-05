import { ConflictError } from '@shared/domain/errors';

export class AdditionalContributionExceedsSuggestionError extends ConflictError {
  constructor() {
    super('recurrences.errors.additional_contribution_exceeds_suggestion');
  }
}
