import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import type { Translate } from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { buildCategory } from '@test/support/builders/category.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { CreateCategoryUseCase } from '../../../application/use-cases/create-category.use-case';
import type { GetCategoryUseCase } from '../../../application/use-cases/get-category.use-case';
import type { ListCategoriesUseCase } from '../../../application/use-cases/list-categories.use-case';
import type { UpdateCategoryStatusUseCase } from '../../../application/use-cases/update-category-status.use-case';
import type { UpdateCategoryUseCase } from '../../../application/use-cases/update-category.use-case';
import { CategoryKind } from '../../../domain/enums/category-kind.enum';
import { CategoryScope } from '../../../domain/enums/category-scope.enum';
import { CategoriesController } from '../categories.controller';

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
  }> = {},
) {
  return new CategoriesController(
    overrides.list ?? mockOf<ListCategoriesUseCase>(),
    overrides.get ?? mockOf<GetCategoryUseCase>(),
    overrides.create ?? mockOf<CreateCategoryUseCase>(),
    overrides.update ?? mockOf<UpdateCategoryUseCase>(),
    overrides.status ?? mockOf<UpdateCategoryStatusUseCase>(),
  );
}

describe('CategoriesController', () => {
  it('names global categories in the request language and personal ones as stored', async () => {
    const execute = jest
      .fn()
      .mockResolvedValue([
        buildCategory({ ownerId: null, code: 'FOOD', name: 'Food' }),
        buildCategory({ uuid: 'own-uuid', name: 'Pets' }),
      ]);

    const controller = buildController({
      list: mockOf<ListCategoriesUseCase>({ execute }),
    });

    const [global, personal] = await controller.findAll(
      { kind: CategoryKind.EXPENSE },
      actor,
      translate,
    );

    expect(execute).toHaveBeenCalledWith({
      ownerId: 31,
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
});
