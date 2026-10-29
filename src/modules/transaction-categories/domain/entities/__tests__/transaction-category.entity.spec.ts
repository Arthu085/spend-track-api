import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { TransactionCategoryKind } from '../../enums/transaction-category-kind.enum';
import { TransactionCategoryScope } from '../../enums/transaction-category-scope.enum';
import { TransactionCategoryEntity } from '../transaction-category.entity';

describe('TransactionCategoryEntity', () => {
  it('creates an active personal category without a catalog code', () => {
    const category = TransactionCategoryEntity.createPersonal({
      uuid: 'category-uuid',
      ownerId: 5,
      kind: TransactionCategoryKind.EXPENSE,
      name: 'Pets',
      color: '#123456',
    });

    expect(category).toMatchObject({
      id: 0,
      ownerId: 5,
      code: null,
      status: RecordStatus.ACTIVE,
      scope: TransactionCategoryScope.PERSONAL,
    });
  });

  it('is global when it has no owner', () => {
    const category = TransactionCategoryEntity.reconstitute({
      id: 1,
      uuid: 'category-uuid',
      status: RecordStatus.ACTIVE,
      ownerId: null,
      code: 'FOOD',
      name: 'Food',
      kind: TransactionCategoryKind.EXPENSE,
      color: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    expect(category.scope).toBe(TransactionCategoryScope.GLOBAL);
  });

  it('keeps kind and ownership when its details or status change', () => {
    const category = TransactionCategoryEntity.createPersonal({
      uuid: 'category-uuid',
      ownerId: 5,
      kind: TransactionCategoryKind.INCOME,
      name: 'Bonus',
      color: null,
    })
      .withDetails({ name: 'Yearly bonus', color: '#ABCDEF' })
      .withStatus(RecordStatus.INACTIVE);

    expect(category).toMatchObject({
      ownerId: 5,
      kind: TransactionCategoryKind.INCOME,
      name: 'Yearly bonus',
      color: '#ABCDEF',
      status: RecordStatus.INACTIVE,
    });
  });
});
