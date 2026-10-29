import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { CategoryKind } from '../../enums/category-kind.enum';
import { CategoryScope } from '../../enums/category-scope.enum';
import { CategoryEntity } from '../category.entity';

describe('CategoryEntity', () => {
  it('creates an active personal category without a catalog code', () => {
    const category = CategoryEntity.createPersonal({
      uuid: 'category-uuid',
      ownerId: 5,
      kind: CategoryKind.EXPENSE,
      name: 'Pets',
      color: '#123456',
    });

    expect(category).toMatchObject({
      id: 0,
      ownerId: 5,
      code: null,
      status: RecordStatus.ACTIVE,
      scope: CategoryScope.PERSONAL,
    });
  });

  it('is global when it has no owner', () => {
    const category = CategoryEntity.reconstitute({
      id: 1,
      uuid: 'category-uuid',
      status: RecordStatus.ACTIVE,
      ownerId: null,
      code: 'FOOD',
      name: 'Food',
      kind: CategoryKind.EXPENSE,
      color: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    expect(category.scope).toBe(CategoryScope.GLOBAL);
  });

  it('keeps kind and ownership when its details or status change', () => {
    const category = CategoryEntity.createPersonal({
      uuid: 'category-uuid',
      ownerId: 5,
      kind: CategoryKind.INCOME,
      name: 'Bonus',
      color: null,
    })
      .withDetails({ name: 'Yearly bonus', color: '#ABCDEF' })
      .withStatus(RecordStatus.INACTIVE);

    expect(category).toMatchObject({
      ownerId: 5,
      kind: CategoryKind.INCOME,
      name: 'Yearly bonus',
      color: '#ABCDEF',
      status: RecordStatus.INACTIVE,
    });
  });
});
