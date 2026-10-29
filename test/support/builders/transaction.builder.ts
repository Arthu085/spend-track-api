import {
  TransactionEntity,
  type ReconstituteTransactionInput,
} from '@modules/transactions/domain/entities/transaction.entity';
import { TransactionState } from '@modules/transactions/domain/enums/transaction-state.enum';
import { TransactionType } from '@modules/transactions/domain/enums/transaction-type.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildAccount } from './account.builder';
import { buildTransactionCategory } from './transaction-category.builder';

export function buildTransaction(
  overrides: Partial<ReconstituteTransactionInput> = {},
): TransactionEntity {
  return TransactionEntity.reconstitute({
    id: 1,
    uuid: 'transaction-uuid',
    status: RecordStatus.ACTIVE,
    ownerId: 1,
    type: TransactionType.EXPENSE,
    description: 'Groceries',
    amount: 25040,
    date: '2026-10-29',
    state: TransactionState.PLANNED,
    completedOn: null,
    canceledAt: null,
    account: buildAccount(),
    destinationAccount: null,
    category: buildTransactionCategory(),
    notes: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  });
}
