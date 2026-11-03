import type { SpendingPerspective } from '@modules/preferences';
import type { TransactionCategoryEntity } from '@modules/transaction-categories';
import type { TransactionState } from '@modules/transactions';
import { RecurrenceCardChargeEntity } from '../entities/recurrence-card-charge.entity';

export const RECURRENCE_CARD_CHARGE_REPOSITORY = Symbol(
  'RECURRENCE_CARD_CHARGE_REPOSITORY',
);

export interface PaginatedRecurrenceCardCharges {
  items: RecurrenceCardChargeEntity[];
  total: number;
}

export interface OccurrenceListFilters {
  from?: string;
  to?: string;
  state?: TransactionState;
}

export interface PlannedCardChargeQuery {
  from: string;
  to: string;
  perspective: SpendingPerspective;
}

export interface PlannedCardChargeTotal {
  category: TransactionCategoryEntity;
  total: number;
}

export interface RecurrenceCardChargeRepository {
  findPaginatedByRecurrence(
    recurrenceId: number,
    offset: number,
    limit: number,
    filters?: OccurrenceListFilters,
  ): Promise<PaginatedRecurrenceCardCharges>;
  findByUuidForRecurrence(
    uuid: string,
    recurrenceId: number,
  ): Promise<RecurrenceCardChargeEntity | null>;
  findPlannedByRecurrence(
    recurrenceId: number,
    occurrenceFrom?: string,
  ): Promise<RecurrenceCardChargeEntity[]>;
  sumPlannedByCategory(
    ownerId: number,
    query: PlannedCardChargeQuery,
  ): Promise<PlannedCardChargeTotal[]>;
  create(
    charge: RecurrenceCardChargeEntity,
  ): Promise<RecurrenceCardChargeEntity>;
  update(
    charge: RecurrenceCardChargeEntity,
  ): Promise<RecurrenceCardChargeEntity>;
  softDelete(charge: RecurrenceCardChargeEntity): Promise<void>;
}
