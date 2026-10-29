import { buildCategory } from '@test/support/builders/category.builder';
import { CategoryMapper } from '../category.mapper';

describe('CategoryMapper', () => {
  it('round-trips a personal category', () => {
    const category = buildCategory({ id: 4, ownerId: 9 });

    const orm = CategoryMapper.toOrm(category);

    expect(orm).toMatchObject({ id: 4, userId: 9, code: null });
    expect(CategoryMapper.toDomain(orm)).toMatchObject({
      id: 4,
      ownerId: 9,
      code: null,
      name: category.name,
      kind: category.kind,
      color: category.color,
    });
  });

  it('leaves id and updatedAt unset for a new category', () => {
    const orm = CategoryMapper.toOrm(buildCategory({ id: 0 }));

    expect(orm.id).toBeUndefined();
    expect(orm.updatedAt).toBeUndefined();
  });
});
