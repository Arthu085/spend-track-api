import { NotFoundError } from '@shared/domain/errors';

export class BudgetNotFoundError extends NotFoundError {
  constructor() {
    super('budgets.errors.budget_not_found');
  }
}
