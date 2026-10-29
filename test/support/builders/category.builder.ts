import {
  CategoryEntity,
  type ReconstituteCategoryInput,
} from '@modules/categories/domain/entities/category.entity';
import { CategoryKind } from '@modules/categories/domain/enums/category-kind.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';

export function buildCategory(
  overrides: Partial<ReconstituteCategoryInput> = {},
): CategoryEntity {
  return CategoryEntity.reconstitute({
    id: 1,
    uuid: 'category-uuid',
    status: RecordStatus.ACTIVE,
    ownerId: 1,
    code: null,
    name: 'Pets',
    kind: CategoryKind.EXPENSE,
    color: '#123456',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  });
}
