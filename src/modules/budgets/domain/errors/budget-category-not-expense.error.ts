import { ValidationError } from '@shared/domain/errors';

export class BudgetCategoryNotExpenseError extends ValidationError {
  constructor() {
    super('budgets.errors.category_not_expense');
  }
}
