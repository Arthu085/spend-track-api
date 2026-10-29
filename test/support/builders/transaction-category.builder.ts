import {
  TransactionCategoryEntity,
  type ReconstituteTransactionCategoryInput,
} from '@modules/transaction-categories/domain/entities/transaction-category.entity';
import { TransactionCategoryKind } from '@modules/transaction-categories/domain/enums/transaction-category-kind.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';

export function buildTransactionCategory(
  overrides: Partial<ReconstituteTransactionCategoryInput> = {},
): TransactionCategoryEntity {
  return TransactionCategoryEntity.reconstitute({
    id: 1,
    uuid: 'category-uuid',
    status: RecordStatus.ACTIVE,
    ownerId: 1,
    code: null,
    name: 'Pets',
    kind: TransactionCategoryKind.EXPENSE,
    color: '#123456',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  });
}
