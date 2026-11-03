import { ValidationError } from '@shared/domain/errors';

export class EmptyBudgetError extends ValidationError {
  constructor() {
    super('budgets.errors.empty_budget');
  }
}
