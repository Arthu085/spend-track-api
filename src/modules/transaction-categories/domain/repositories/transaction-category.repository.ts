import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { TransactionCategoryEntity } from '../entities/transaction-category.entity';
import { TransactionCategoryKind } from '../enums/transaction-category-kind.enum';
import { TransactionCategoryScope } from '../enums/transaction-category-scope.enum';

export const TRANSACTION_CATEGORY_REPOSITORY = Symbol(
  'TRANSACTION_CATEGORY_REPOSITORY',
);

export interface PaginatedTransactionCategories {
  items: TransactionCategoryEntity[];
  total: number;
}

export interface TransactionCategoryListFilters {
  kind?: TransactionCategoryKind;
  scope?: TransactionCategoryScope;
  status?: RecordStatus;
}

export interface TransactionCategoryRepository {
  findAllPaginatedVisibleTo(
    ownerId: number,
    offset: number,
    limit: number,
    filters?: TransactionCategoryListFilters,
  ): Promise<PaginatedTransactionCategories>;
  findVisibleByUuid(
    uuid: string,
    ownerId: number,
  ): Promise<TransactionCategoryEntity | null>;
  create(
    category: TransactionCategoryEntity,
  ): Promise<TransactionCategoryEntity>;
  update(
    category: TransactionCategoryEntity,
  ): Promise<TransactionCategoryEntity>;
  softDelete(category: TransactionCategoryEntity): Promise<void>;
}
