export { TransactionCategoryEntity } from './domain/entities/transaction-category.entity';
export { TransactionCategoryKind } from './domain/enums/transaction-category-kind.enum';
export { InactiveTransactionCategoryError } from './domain/errors/inactive-transaction-category.error';
export { TransactionCategoryNotFoundError } from './domain/errors/transaction-category-not-found.error';
export { TRANSACTION_CATEGORY_REPOSITORY } from './domain/repositories/transaction-category.repository';
export type { TransactionCategoryRepository } from './domain/repositories/transaction-category.repository';
export { findVisibleTransactionCategory } from './application/services/find-visible-transaction-category';
