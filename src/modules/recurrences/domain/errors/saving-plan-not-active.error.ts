import { ConflictError } from '@shared/domain/errors';

export class SavingPlanNotActiveError extends ConflictError {
  constructor() {
    super('recurrences.errors.saving_plan_not_active');
  }
}
