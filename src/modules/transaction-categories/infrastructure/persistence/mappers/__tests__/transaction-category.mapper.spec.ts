import { buildTransactionCategory } from '@test/support/builders/transaction-category.builder';
import { TransactionCategoryMapper } from '../transaction-category.mapper';

describe('TransactionCategoryMapper', () => {
  it('round-trips a personal category', () => {
    const category = buildTransactionCategory({ id: 4, ownerId: 9 });

    const orm = TransactionCategoryMapper.toOrm(category);

    expect(orm).toMatchObject({ id: 4, userId: 9, code: null });
    expect(TransactionCategoryMapper.toDomain(orm)).toMatchObject({
      id: 4,
      ownerId: 9,
      code: null,
      name: category.name,
      kind: category.kind,
      color: category.color,
    });
  });

  it('leaves id and updatedAt unset for a new category', () => {
    const orm = TransactionCategoryMapper.toOrm(
      buildTransactionCategory({ id: 0 }),
    );

    expect(orm.id).toBeUndefined();
    expect(orm.updatedAt).toBeUndefined();
  });
});
