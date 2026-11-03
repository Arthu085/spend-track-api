import type { TransactionCategoryEntity } from '@modules/transaction-categories';

export const BUDGET_REPOSITORY = Symbol('BUDGET_REPOSITORY');

export interface BudgetCategoryLimit {
  category: TransactionCategoryEntity;
  limit: number;
}

export interface BudgetValues {
  totalLimit: number | null;
  categoryLimits: BudgetCategoryLimit[];
}

export interface StoredBudget extends BudgetValues {
  month: string;
  updatedAt: Date;
}

export interface BudgetRepository {
  findByMonth(ownerId: number, month: string): Promise<StoredBudget | null>;
  save(
    ownerId: number,
    month: string,
    values: BudgetValues,
  ): Promise<StoredBudget>;
  delete(ownerId: number, month: string): Promise<boolean>;
}
