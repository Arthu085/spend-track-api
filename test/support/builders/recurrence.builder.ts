import {
  RecurrenceCardChargeEntity,
  type ReconstituteRecurrenceCardChargeInput,
} from '@modules/recurrences/domain/entities/recurrence-card-charge.entity';
import {
  RecurrenceEntity,
  type ReconstituteRecurrenceInput,
} from '@modules/recurrences/domain/entities/recurrence.entity';
import { RecurrenceFrequency } from '@modules/recurrences/domain/enums/recurrence-frequency.enum';
import { RecurrenceState } from '@modules/recurrences/domain/enums/recurrence-state.enum';
import { RecurrenceType } from '@modules/recurrences/domain/enums/recurrence-type.enum';
import { TransactionState } from '@modules/transactions/domain/enums/transaction-state.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildAccount } from './account.builder';
import { buildTransactionCategory } from './transaction-category.builder';

const CREATED_AT = new Date('2026-10-01T00:00:00Z');

export function buildRecurrence(
  overrides: Partial<ReconstituteRecurrenceInput> = {},
): RecurrenceEntity {
  return RecurrenceEntity.reconstitute({
    id: 1,
    uuid: 'recurrence-uuid',
    status: RecordStatus.ACTIVE,
    ownerId: 1,
    type: RecurrenceType.EXPENSE,
    description: 'Rent',
    amount: 150000,
    frequency: RecurrenceFrequency.MONTHLY,
    startDate: '2026-10-15',
    endDate: null,
    state: RecurrenceState.ACTIVE,
    account: buildAccount(),
    creditCard: null,
    category: buildTransactionCategory(),
    notes: null,
    generatedThrough: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    deletedAt: null,
    ...overrides,
  });
}

export function buildRecurrenceCardCharge(
  overrides: Partial<ReconstituteRecurrenceCardChargeInput> = {},
): RecurrenceCardChargeEntity {
  return RecurrenceCardChargeEntity.reconstitute({
    id: 1,
    uuid: 'charge-uuid',
    status: RecordStatus.ACTIVE,
    ownerId: 1,
    recurrenceId: 1,
    occurrenceDate: '2026-11-15',
    date: '2026-11-15',
    description: 'Netflix',
    amount: 5590,
    category: buildTransactionCategory(),
    invoiceMonth: '2026-12-01',
    state: TransactionState.PLANNED,
    canceledAt: null,
    purchase: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    deletedAt: null,
    ...overrides,
  });
}
