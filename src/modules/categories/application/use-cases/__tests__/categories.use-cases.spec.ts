import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildCategory } from '@test/support/builders/category.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { CategoryEntity } from '../../../domain/entities/category.entity';
import { CategoryKind } from '../../../domain/enums/category-kind.enum';
import { CategoryScope } from '../../../domain/enums/category-scope.enum';
import { CategoryNotFoundError } from '../../../domain/errors/category-not-found.error';
import { GlobalCategoryReadOnlyError } from '../../../domain/errors/global-category-read-only.error';
import { InactiveCategoryError } from '../../../domain/errors/inactive-category.error';
import type { CategoryRepository } from '../../../domain/repositories/category.repository';
import { CreateCategoryUseCase } from '../create-category.use-case';
import { GetCategoryUseCase } from '../get-category.use-case';
import { ListCategoriesUseCase } from '../list-categories.use-case';
import { UpdateCategoryStatusUseCase } from '../update-category-status.use-case';
import { UpdateCategoryUseCase } from '../update-category.use-case';

const globalCategory = buildCategory({
  ownerId: null,
  code: 'FOOD',
  name: 'Food',
});

function buildRepository(found: CategoryEntity | null = buildCategory()) {
  const repository = {
    findAllPaginatedVisibleTo: jest
      .fn()
      .mockResolvedValue({ items: [], total: 0 }),
    findVisibleByUuid: jest.fn().mockResolvedValue(found),
    create: jest.fn((category: CategoryEntity) => Promise.resolve(category)),
    update: jest.fn((category: CategoryEntity) => Promise.resolve(category)),
  };

  return { repository, port: mockOf<CategoryRepository>(repository) };
}

describe('categories use-cases', () => {
  it('lists the global and own active categories by default', async () => {
    const { repository, port } = buildRepository();

    const result = await new ListCategoriesUseCase(port).execute({
      ownerId: 3,
      page: 2,
      limit: 10,
      kind: CategoryKind.INCOME,
    });

    expect(repository.findAllPaginatedVisibleTo).toHaveBeenCalledWith(
      3,
      10,
      10,
      {
        kind: CategoryKind.INCOME,
        scope: undefined,
        status: RecordStatus.ACTIVE,
      },
    );
    expect(result).toMatchObject({ items: [], total: 0, page: 2, limit: 10 });
  });

  it('reads a category visible to the caller', async () => {
    const { repository, port } = buildRepository(globalCategory);

    await expect(
      new GetCategoryUseCase(port).execute('category-uuid', 3),
    ).resolves.toBe(globalCategory);
    expect(repository.findVisibleByUuid).toHaveBeenCalledWith(
      'category-uuid',
      3,
    );
  });

  // Another user's personal category is reported exactly like a missing one.
  it('reports a category the caller cannot see as not found', async () => {
    const { port } = buildRepository(null);

    await expect(
      new GetCategoryUseCase(port).execute('category-uuid', 3),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
  });

  it('rejects an archived category on read', async () => {
    const { port } = buildRepository(
      buildCategory({ status: RecordStatus.INACTIVE }),
    );

    await expect(
      new GetCategoryUseCase(port).execute('category-uuid', 1),
    ).rejects.toBeInstanceOf(InactiveCategoryError);
  });

  it('creates a personal category owned by the caller', async () => {
    const { port } = buildRepository();

    const created = await new CreateCategoryUseCase(port).execute({
      ownerId: 3,
      kind: CategoryKind.EXPENSE,
      name: 'Pets',
      color: null,
    });

    expect(created.ownerId).toBe(3);
    expect(created.scope).toBe(CategoryScope.PERSONAL);
  });

  it('updates only the sent fields of an own category', async () => {
    const { port } = buildRepository();

    const updated = await new UpdateCategoryUseCase(port).execute({
      uuid: 'category-uuid',
      ownerId: 1,
      name: 'Animals',
    });

    expect(updated).toMatchObject({ name: 'Animals', color: '#123456' });
  });

  it.each([
    [
      'update',
      (port: CategoryRepository) =>
        new UpdateCategoryUseCase(port).execute({
          uuid: 'category-uuid',
          ownerId: 1,
          name: 'Meals',
        }),
    ],
    [
      'archive',
      (port: CategoryRepository) =>
        new UpdateCategoryStatusUseCase(port).execute({
          uuid: 'category-uuid',
          ownerId: 1,
          status: RecordStatus.INACTIVE,
        }),
    ],
  ])('refuses to %s a global category', async (_, run) => {
    const { repository, port } = buildRepository(globalCategory);

    await expect(run(port)).rejects.toBeInstanceOf(GlobalCategoryReadOnlyError);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rejects editing an archived category', async () => {
    const { port } = buildRepository(
      buildCategory({ status: RecordStatus.INACTIVE }),
    );

    await expect(
      new UpdateCategoryUseCase(port).execute({
        uuid: 'category-uuid',
        ownerId: 1,
        name: 'Animals',
      }),
    ).rejects.toBeInstanceOf(InactiveCategoryError);
  });

  it('archives and restores an own category', async () => {
    const { port } = buildRepository(
      buildCategory({ status: RecordStatus.INACTIVE }),
    );

    const restored = await new UpdateCategoryStatusUseCase(port).execute({
      uuid: 'category-uuid',
      ownerId: 1,
      status: RecordStatus.ACTIVE,
    });

    expect(restored.status).toBe(RecordStatus.ACTIVE);
  });

  it('rejects a status change on a category the caller cannot see', async () => {
    const { port } = buildRepository(null);

    await expect(
      new UpdateCategoryStatusUseCase(port).execute({
        uuid: 'category-uuid',
        ownerId: 2,
        status: RecordStatus.INACTIVE,
      }),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
  });
});
