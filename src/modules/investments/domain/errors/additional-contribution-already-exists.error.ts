import { ConflictError } from '@shared/domain/errors';

export class AdditionalContributionAlreadyExistsError extends ConflictError {
  constructor() {
    super('investments.errors.additional_contribution_already_exists');
  }
}
