import type { EntityManager } from 'typeorm';
import { mockOf } from '@test/support/mocks/mock-of';
import { GLOBAL_CATEGORIES } from '../../../domain/catalog/global-categories';
import { CategoryOrmEntity } from '../../persistence/entities/category.orm-entity';
import { GlobalCategoriesSeeder } from '../global-categories.seeder';

describe('GlobalCategoriesSeeder', () => {
  function buildManager(existingCodes: string[]) {
    const findOne = jest.fn(
      ({ where: { code } }: { where: { code: string } }) =>
        Promise.resolve(existingCodes.includes(code) ? { code } : null),
    );

    const create = jest.fn((input: Partial<CategoryOrmEntity>) => input);

    const save = jest.fn((row: Partial<CategoryOrmEntity>) =>
      Promise.resolve(row),
    );

    const manager = mockOf<EntityManager>({
      getRepository: jest.fn((entity: unknown) => {
        if (entity !== CategoryOrmEntity) {
          throw new Error('unexpected entity requested');
        }

        return { findOne, create, save };
      }) as unknown as EntityManager['getRepository'],
    });

    return { manager, findOne, save };
  }

  it('inserts every catalog category as a global one when none exists', async () => {
    const { manager, save } = buildManager([]);

    await new GlobalCategoriesSeeder().run(manager);

    expect(save).toHaveBeenCalledTimes(GLOBAL_CATEGORIES.length);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, code: 'FOOD' }),
    );
  });

  // Soft-deleted rows count as existing, so a re-seed never resurrects or
  // duplicates a category removed on purpose.
  it('skips categories that already exist, including soft-deleted ones', async () => {
    const { manager, findOne, save } = buildManager(
      GLOBAL_CATEGORIES.map((category) => category.code).slice(1),
    );

    await new GlobalCategoriesSeeder().run(manager);

    expect(save).toHaveBeenCalledTimes(1);
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ withDeleted: true }),
    );
  });

  it('exposes a stable seeder name', () => {
    expect(new GlobalCategoriesSeeder().name).toBe('global-categories-seeder');
  });
});
