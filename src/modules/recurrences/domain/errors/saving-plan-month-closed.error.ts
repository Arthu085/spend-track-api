import { ValidationError } from '@shared/domain/errors';

export class SavingPlanMonthClosedError extends ValidationError {
  constructor() {
    super('recurrences.errors.saving_plan_month_closed');
  }
}
