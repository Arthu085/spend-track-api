import { PaginatedResult } from '@shared/application/dto';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import type { Translate } from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { buildCategory } from '@test/support/builders/category.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { CreateCategoryUseCase } from '../../../application/use-cases/create-category.use-case';
import type { DeleteCategoryUseCase } from '../../../application/use-cases/delete-category.use-case';
import type { GetCategoryUseCase } from '../../../application/use-cases/get-category.use-case';
import type { ListCategoriesUseCase } from '../../../application/use-cases/list-categories.use-case';
import type { UpdateCategoryStatusUseCase } from '../../../application/use-cases/update-category-status.use-case';
import type { UpdateCategoryUseCase } from '../../../application/use-cases/update-category.use-case';
import { CategoryKind } from '../../../domain/enums/category-kind.enum';
import { CategoryScope } from '../../../domain/enums/category-scope.enum';
import { CategoriesController } from '../categories.controller';
import { ListCategoriesQueryDto } from '../../dto/input/list-categories-query.dto';

const translations: Record<string, string> = {
  'categories.global.food': 'Alimentação',
  'categories.scope.global': 'Global',
};

const translate: Translate = (key) => translations[key] ?? key;

const actor: AuthenticatedUser = {
  id: 31,
  uuid: 'actor-uuid',
  email: 'actor@example.com',
  name: 'Actor',
  roles: ['USER'],
};

function buildController(
  overrides: Partial<{
    list: ListCategoriesUseCase;
    get: GetCategoryUseCase;
    create: CreateCategoryUseCase;
    update: UpdateCategoryUseCase;
    status: UpdateCategoryStatusUseCase;
    remove: DeleteCategoryUseCase;
  }> = {},
) {
  return new CategoriesController(
    overrides.list ?? mockOf<ListCategoriesUseCase>(),
    overrides.get ?? mockOf<GetCategoryUseCase>(),
    overrides.create ?? mockOf<CreateCategoryUseCase>(),
    overrides.update ?? mockOf<UpdateCategoryUseCase>(),
    overrides.status ?? mockOf<UpdateCategoryStatusUseCase>(),
    overrides.remove ?? mockOf<DeleteCategoryUseCase>(),
  );
}

describe('CategoriesController', () => {
  it('names global categories in the request language and personal ones as stored', async () => {
    const execute = jest
      .fn()
      .mockResolvedValue(
        PaginatedResult.of(
          [
            buildCategory({ ownerId: null, code: 'FOOD', name: 'Food' }),
            buildCategory({ uuid: 'own-uuid', name: 'Pets' }),
          ],
          2,
          1,
          20,
        ),
      );

    const controller = buildController({
      list: mockOf<ListCategoriesUseCase>({ execute }),
    });

    const {
      items: [global, personal],
    } = await controller.findAll(
      Object.assign(new ListCategoriesQueryDto(), {
        kind: CategoryKind.EXPENSE,
      }),
      actor,
      translate,
    );

    expect(execute).toHaveBeenCalledWith({
      ownerId: 31,
      page: 1,
      limit: 20,
      kind: CategoryKind.EXPENSE,
      scope: undefined,
      status: undefined,
    });
    expect(global).toMatchObject({
      name: 'Alimentação',
      scope: CategoryScope.GLOBAL,
      scopeLabel: 'Global',
    });
    expect(personal).toMatchObject({
      name: 'Pets',
      scope: CategoryScope.PERSONAL,
    });
  });

  it('falls back to the stored name of an untranslated global category', async () => {
    const execute = jest
      .fn()
      .mockResolvedValue(
        buildCategory({ ownerId: null, code: 'NEW_CODE', name: 'New' }),
      );

    const controller = buildController({
      get: mockOf<GetCategoryUseCase>({ execute }),
    });

    const result = await controller.findOne('category-uuid', actor, translate);

    expect(execute).toHaveBeenCalledWith('category-uuid', 31);
    expect(result.name).toBe('New');
  });

  it('creates a personal category for the caller', async () => {
    const execute = jest.fn().mockResolvedValue(buildCategory());

    const controller = buildController({
      create: mockOf<CreateCategoryUseCase>({ execute }),
    });

    await controller.create(
      { name: 'Pets', kind: CategoryKind.EXPENSE },
      actor,
      translate,
    );

    expect(execute).toHaveBeenCalledWith({
      ownerId: 31,
      name: 'Pets',
      kind: CategoryKind.EXPENSE,
      color: null,
    });
  });

  it('scopes updates and status changes to the caller', async () => {
    const update = jest.fn().mockResolvedValue(buildCategory());
    const status = jest.fn().mockResolvedValue(buildCategory());

    const controller = buildController({
      update: mockOf<UpdateCategoryUseCase>({ execute: update }),
      status: mockOf<UpdateCategoryStatusUseCase>({ execute: status }),
    });

    await controller.update(
      'category-uuid',
      { color: '#ABCDEF' },
      actor,
      translate,
    );
    await controller.updateStatus(
      'category-uuid',
      { status: RecordStatus.INACTIVE },
      actor,
      translate,
    );

    expect(update).toHaveBeenCalledWith({
      uuid: 'category-uuid',
      ownerId: 31,
      name: undefined,
      color: '#ABCDEF',
    });
    expect(status).toHaveBeenCalledWith({
      uuid: 'category-uuid',
      ownerId: 31,
      status: RecordStatus.INACTIVE,
    });
  });

  it('deletes a category within the caller visibility', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);

    const controller = buildController({
      remove: mockOf<DeleteCategoryUseCase>({ execute }),
    });

    await controller.remove('category-uuid', actor);

    expect(execute).toHaveBeenCalledWith({
      uuid: 'category-uuid',
      ownerId: 31,
    });
  });
});
