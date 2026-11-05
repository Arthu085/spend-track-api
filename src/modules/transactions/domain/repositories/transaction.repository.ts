import type { TransactionCategoryEntity } from '@modules/transaction-categories';
import { TransactionEntity } from '../entities/transaction.entity';
import { TransactionState } from '../enums/transaction-state.enum';
import { TransactionType } from '../enums/transaction-type.enum';

export const TRANSACTION_REPOSITORY = Symbol('TRANSACTION_REPOSITORY');

export interface PaginatedTransactions {
  items: TransactionEntity[];
  total: number;
}

export interface TransactionListFilters {
  from?: string;
  to?: string;
  type?: TransactionType;
  state?: TransactionState;
  accountUuid?: string;
  categoryUuid?: string;
  recurrenceUuid?: string;
  description?: string;
}

export interface RecurrenceOccurrenceFilters {
  from?: string;
  to?: string;
  state?: TransactionState;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface BalanceChangeFilter {
  state: TransactionState;
  until?: string;
}

export interface TransactionTotal {
  type: TransactionType;
  state: TransactionState;
  total: number;
}

export interface CategoryExpenseTotal {
  category: TransactionCategoryEntity;
  state: TransactionState;
  total: number;
}

export interface TransactionRepository {
  findAllPaginatedByOwner(
    ownerId: number,
    offset: number,
    limit: number,
    filters?: TransactionListFilters,
  ): Promise<PaginatedTransactions>;
  findByUuidForOwner(
    uuid: string,
    ownerId: number,
  ): Promise<TransactionEntity | null>;
  findByUuidForOwnerForUpdate(
    uuid: string,
    ownerId: number,
  ): Promise<TransactionEntity | null>;
  findPaginatedByRecurrence(
    ownerId: number,
    recurrenceId: number,
    offset: number,
    limit: number,
    filters?: RecurrenceOccurrenceFilters,
  ): Promise<PaginatedTransactions>;
  findPlannedByRecurrence(
    ownerId: number,
    recurrenceId: number,
    occurrenceFrom?: string,
  ): Promise<TransactionEntity[]>;
  findPlannedUntil(
    ownerId: number,
    until: string,
    limit: number,
  ): Promise<PaginatedTransactions>;
  findAllPlannedUntil(
    ownerId: number,
    until: string,
  ): Promise<TransactionEntity[]>;
  sumBalanceChanges(
    ownerId: number,
    accountIds: readonly number[],
    filter: BalanceChangeFilter,
  ): Promise<Map<number, number>>;
  findRecurrenceDatesFrom(
    ownerId: number,
    recurrenceId: number,
    from: string,
  ): Promise<string[]>;
  existsForAccount(ownerId: number, accountId: number): Promise<boolean>;
  findEarliestDateForAccount(
    ownerId: number,
    accountId: number,
  ): Promise<string | null>;
  sumByTypeAndState(
    ownerId: number,
    range: DateRange,
  ): Promise<TransactionTotal[]>;
  sumExpensesByCategory(
    ownerId: number,
    range: DateRange,
  ): Promise<CategoryExpenseTotal[]>;
  create(transaction: TransactionEntity): Promise<TransactionEntity>;
  update(transaction: TransactionEntity): Promise<TransactionEntity>;
  softDelete(transaction: TransactionEntity): Promise<void>;
}
