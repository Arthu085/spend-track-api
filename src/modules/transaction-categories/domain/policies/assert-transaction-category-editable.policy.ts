import { TransactionCategoryEntity } from '../entities/transaction-category.entity';
import { TransactionCategoryScope } from '../enums/transaction-category-scope.enum';
import { GlobalTransactionCategoryReadOnlyError } from '../errors/global-transaction-category-read-only.error';

export function assertTransactionCategoryEditable(
  category: TransactionCategoryEntity,
): void {
  if (category.scope === TransactionCategoryScope.GLOBAL) {
    throw new GlobalTransactionCategoryReadOnlyError();
  }
}
