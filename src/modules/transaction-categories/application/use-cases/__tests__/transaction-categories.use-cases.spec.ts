import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildTransactionCategory } from '@test/support/builders/transaction-category.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { TransactionCategoryEntity } from '../../../domain/entities/transaction-category.entity';
import { TransactionCategoryKind } from '../../../domain/enums/transaction-category-kind.enum';
import { TransactionCategoryScope } from '../../../domain/enums/transaction-category-scope.enum';
import { TransactionCategoryNotFoundError } from '../../../domain/errors/transaction-category-not-found.error';
import { GlobalTransactionCategoryReadOnlyError } from '../../../domain/errors/global-transaction-category-read-only.error';
import { InactiveTransactionCategoryError } from '../../../domain/errors/inactive-transaction-category.error';
import type { TransactionCategoryRepository } from '../../../domain/repositories/transaction-category.repository';
import { CreateTransactionCategoryUseCase } from '../create-transaction-category.use-case';
import { DeleteTransactionCategoryUseCase } from '../delete-transaction-category.use-case';
import { GetTransactionCategoryUseCase } from '../get-transaction-category.use-case';
import { ListTransactionCategoriesUseCase } from '../list-transaction-categories.use-case';
import { UpdateTransactionCategoryStatusUseCase } from '../update-transaction-category-status.use-case';
import { UpdateTransactionCategoryUseCase } from '../update-transaction-category.use-case';

const globalTransactionCategory = buildTransactionCategory({
  ownerId: null,
  code: 'FOOD',
  name: 'Food',
});

function buildRepository(
  found: TransactionCategoryEntity | null = buildTransactionCategory(),
) {
  const repository = {
    findAllPaginatedVisibleTo: jest
      .fn()
      .mockResolvedValue({ items: [], total: 0 }),
    findVisibleByUuid: jest.fn().mockResolvedValue(found),
    create: jest.fn((category: TransactionCategoryEntity) =>
      Promise.resolve(category),
    ),
    update: jest.fn((category: TransactionCategoryEntity) =>
      Promise.resolve(category),
    ),
    softDelete: jest.fn().mockResolvedValue(undefined),
  };

  return {
    repository,
    port: mockOf<TransactionCategoryRepository>(repository),
  };
}

describe('categories use-cases', () => {
  it('lists the global and own active categories by default', async () => {
    const { repository, port } = buildRepository();

    const result = await new ListTransactionCategoriesUseCase(port).execute({
      ownerId: 3,
      page: 2,
      limit: 10,
      kind: TransactionCategoryKind.INCOME,
    });

    expect(repository.findAllPaginatedVisibleTo).toHaveBeenCalledWith(
      3,
      10,
      10,
      {
        kind: TransactionCategoryKind.INCOME,
        scope: undefined,
        status: RecordStatus.ACTIVE,
      },
    );
    expect(result).toMatchObject({ items: [], total: 0, page: 2, limit: 10 });
  });

  it('reads a category visible to the caller', async () => {
    const { repository, port } = buildRepository(globalTransactionCategory);

    await expect(
      new GetTransactionCategoryUseCase(port).execute('category-uuid', 3),
    ).resolves.toBe(globalTransactionCategory);
    expect(repository.findVisibleByUuid).toHaveBeenCalledWith(
      'category-uuid',
      3,
    );
  });

  // Another user's personal category is reported exactly like a missing one.
  it('reports a category the caller cannot see as not found', async () => {
    const { port } = buildRepository(null);

    await expect(
      new GetTransactionCategoryUseCase(port).execute('category-uuid', 3),
    ).rejects.toBeInstanceOf(TransactionCategoryNotFoundError);
  });

  it('rejects an archived category on read', async () => {
    const { port } = buildRepository(
      buildTransactionCategory({ status: RecordStatus.INACTIVE }),
    );

    await expect(
      new GetTransactionCategoryUseCase(port).execute('category-uuid', 1),
    ).rejects.toBeInstanceOf(InactiveTransactionCategoryError);
  });

  it('creates a personal category owned by the caller', async () => {
    const { port } = buildRepository();

    const created = await new CreateTransactionCategoryUseCase(port).execute({
      ownerId: 3,
      kind: TransactionCategoryKind.EXPENSE,
      name: 'Pets',
      color: null,
    });

    expect(created.ownerId).toBe(3);
    expect(created.scope).toBe(TransactionCategoryScope.PERSONAL);
  });

  it('updates only the sent fields of an own category', async () => {
    const { port } = buildRepository();

    const updated = await new UpdateTransactionCategoryUseCase(port).execute({
      uuid: 'category-uuid',
      ownerId: 1,
      name: 'Animals',
    });

    expect(updated).toMatchObject({ name: 'Animals', color: '#123456' });
  });

  it.each([
    [
      'update',
      (port: TransactionCategoryRepository) =>
        new UpdateTransactionCategoryUseCase(port).execute({
          uuid: 'category-uuid',
          ownerId: 1,
          name: 'Meals',
        }),
    ],
    [
      'archive',
      (port: TransactionCategoryRepository) =>
        new UpdateTransactionCategoryStatusUseCase(port).execute({
          uuid: 'category-uuid',
          ownerId: 1,
          status: RecordStatus.INACTIVE,
        }),
    ],
  ])('refuses to %s a global category', async (_, run) => {
    const { repository, port } = buildRepository(globalTransactionCategory);

    await expect(run(port)).rejects.toBeInstanceOf(
      GlobalTransactionCategoryReadOnlyError,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rejects editing an archived category', async () => {
    const { port } = buildRepository(
      buildTransactionCategory({ status: RecordStatus.INACTIVE }),
    );

    await expect(
      new UpdateTransactionCategoryUseCase(port).execute({
        uuid: 'category-uuid',
        ownerId: 1,
        name: 'Animals',
      }),
    ).rejects.toBeInstanceOf(InactiveTransactionCategoryError);
  });

  it('archives and restores an own category', async () => {
    const { port } = buildRepository(
      buildTransactionCategory({ status: RecordStatus.INACTIVE }),
    );

    const restored = await new UpdateTransactionCategoryStatusUseCase(
      port,
    ).execute({
      uuid: 'category-uuid',
      ownerId: 1,
      status: RecordStatus.ACTIVE,
    });

    expect(restored.status).toBe(RecordStatus.ACTIVE);
  });

  it('rejects a status change on a category the caller cannot see', async () => {
    const { port } = buildRepository(null);

    await expect(
      new UpdateTransactionCategoryStatusUseCase(port).execute({
        uuid: 'category-uuid',
        ownerId: 2,
        status: RecordStatus.INACTIVE,
      }),
    ).rejects.toBeInstanceOf(TransactionCategoryNotFoundError);
  });

  it('soft-deletes an own category', async () => {
    const category = buildTransactionCategory();
    const { repository, port } = buildRepository(category);

    await new DeleteTransactionCategoryUseCase(port).execute({
      uuid: 'category-uuid',
      ownerId: 1,
    });

    expect(repository.findVisibleByUuid).toHaveBeenCalledWith(
      'category-uuid',
      1,
    );
    expect(repository.softDelete).toHaveBeenCalledWith(category);
  });

  it('refuses to delete a global category', async () => {
    const { repository, port } = buildRepository(globalTransactionCategory);

    await expect(
      new DeleteTransactionCategoryUseCase(port).execute({
        uuid: 'category-uuid',
        ownerId: 1,
      }),
    ).rejects.toBeInstanceOf(GlobalTransactionCategoryReadOnlyError);
    expect(repository.softDelete).not.toHaveBeenCalled();
  });

  it('reports a category the caller cannot see as not found on delete', async () => {
    const { repository, port } = buildRepository(null);

    await expect(
      new DeleteTransactionCategoryUseCase(port).execute({
        uuid: 'category-uuid',
        ownerId: 2,
      }),
    ).rejects.toBeInstanceOf(TransactionCategoryNotFoundError);
    expect(repository.softDelete).not.toHaveBeenCalled();
  });
});
