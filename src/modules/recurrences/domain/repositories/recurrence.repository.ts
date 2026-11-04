import { RecurrenceEntity } from '../entities/recurrence.entity';
import { RecurrenceState } from '../enums/recurrence-state.enum';
import { RecurrenceType } from '../enums/recurrence-type.enum';

export const RECURRENCE_REPOSITORY = Symbol('RECURRENCE_REPOSITORY');

export interface PaginatedRecurrences {
  items: RecurrenceEntity[];
  total: number;
}

export interface RecurrenceListFilters {
  state?: RecurrenceState;
  type?: RecurrenceType;
  description?: string;
}

export interface RecurrenceKey {
  uuid: string;
  ownerId: number;
}

export interface RecurrenceRepository {
  findAllPaginatedByOwner(
    ownerId: number,
    offset: number,
    limit: number,
    today: string,
    filters?: RecurrenceListFilters,
  ): Promise<PaginatedRecurrences>;
  findByUuidForOwner(
    uuid: string,
    ownerId: number,
  ): Promise<RecurrenceEntity | null>;
  findByUuidForOwnerForUpdate(
    uuid: string,
    ownerId: number,
  ): Promise<RecurrenceEntity | null>;
  findDueForGeneration(
    through: string,
    today: string,
    limit: number,
  ): Promise<RecurrenceKey[]>;
  create(recurrence: RecurrenceEntity): Promise<RecurrenceEntity>;
  update(recurrence: RecurrenceEntity): Promise<RecurrenceEntity>;
}
