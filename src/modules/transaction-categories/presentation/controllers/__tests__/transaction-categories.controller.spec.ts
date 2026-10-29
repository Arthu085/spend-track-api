import { PaginatedResult } from '@shared/application/dto';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import type { Translate } from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { buildTransactionCategory } from '@test/support/builders/transaction-category.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { CreateTransactionCategoryUseCase } from '../../../application/use-cases/create-transaction-category.use-case';
import type { DeleteTransactionCategoryUseCase } from '../../../application/use-cases/delete-transaction-category.use-case';
import type { GetTransactionCategoryUseCase } from '../../../application/use-cases/get-transaction-category.use-case';
import type { ListTransactionCategoriesUseCase } from '../../../application/use-cases/list-transaction-categories.use-case';
import type { UpdateTransactionCategoryStatusUseCase } from '../../../application/use-cases/update-transaction-category-status.use-case';
import type { UpdateTransactionCategoryUseCase } from '../../../application/use-cases/update-transaction-category.use-case';
import { TransactionCategoryKind } from '../../../domain/enums/transaction-category-kind.enum';
import { TransactionCategoryScope } from '../../../domain/enums/transaction-category-scope.enum';
import { TransactionCategoriesController } from '../transaction-categories.controller';
import { ListTransactionCategoriesQueryDto } from '../../dto/input/list-transaction-categories-query.dto';

const translations: Record<string, string> = {
  'transaction_categories.global.food': 'Alimentação',
  'transaction_categories.scope.global': 'Global',
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
    list: ListTransactionCategoriesUseCase;
    get: GetTransactionCategoryUseCase;
    create: CreateTransactionCategoryUseCase;
    update: UpdateTransactionCategoryUseCase;
    status: UpdateTransactionCategoryStatusUseCase;
    remove: DeleteTransactionCategoryUseCase;
  }> = {},
) {
  return new TransactionCategoriesController(
    overrides.list ?? mockOf<ListTransactionCategoriesUseCase>(),
    overrides.get ?? mockOf<GetTransactionCategoryUseCase>(),
    overrides.create ?? mockOf<CreateTransactionCategoryUseCase>(),
    overrides.update ?? mockOf<UpdateTransactionCategoryUseCase>(),
    overrides.status ?? mockOf<UpdateTransactionCategoryStatusUseCase>(),
    overrides.remove ?? mockOf<DeleteTransactionCategoryUseCase>(),
  );
}

describe('TransactionCategoriesController', () => {
  it('names global categories in the request language and personal ones as stored', async () => {
    const execute = jest.fn().mockResolvedValue(
      PaginatedResult.of(
        [
          buildTransactionCategory({
            ownerId: null,
            code: 'FOOD',
            name: 'Food',
          }),
          buildTransactionCategory({ uuid: 'own-uuid', name: 'Pets' }),
        ],
        2,
        1,
        20,
      ),
    );

    const controller = buildController({
      list: mockOf<ListTransactionCategoriesUseCase>({ execute }),
    });

    const {
      items: [global, personal],
    } = await controller.findAll(
      Object.assign(new ListTransactionCategoriesQueryDto(), {
        kind: TransactionCategoryKind.EXPENSE,
      }),
      actor,
      translate,
    );

    expect(execute).toHaveBeenCalledWith({
      ownerId: 31,
      page: 1,
      limit: 20,
      kind: TransactionCategoryKind.EXPENSE,
      scope: undefined,
      status: undefined,
    });
    expect(global).toMatchObject({
      name: 'Alimentação',
      scope: TransactionCategoryScope.GLOBAL,
      scopeLabel: 'Global',
    });
    expect(personal).toMatchObject({
      name: 'Pets',
      scope: TransactionCategoryScope.PERSONAL,
    });
  });

  it('falls back to the stored name of an untranslated global category', async () => {
    const execute = jest.fn().mockResolvedValue(
      buildTransactionCategory({
        ownerId: null,
        code: 'NEW_CODE',
        name: 'New',
      }),
    );

    const controller = buildController({
      get: mockOf<GetTransactionCategoryUseCase>({ execute }),
    });

    const result = await controller.findOne('category-uuid', actor, translate);

    expect(execute).toHaveBeenCalledWith('category-uuid', 31);
    expect(result.name).toBe('New');
  });

  it('creates a personal category for the caller', async () => {
    const execute = jest.fn().mockResolvedValue(buildTransactionCategory());

    const controller = buildController({
      create: mockOf<CreateTransactionCategoryUseCase>({ execute }),
    });

    await controller.create(
      { name: 'Pets', kind: TransactionCategoryKind.EXPENSE },
      actor,
      translate,
    );

    expect(execute).toHaveBeenCalledWith({
      ownerId: 31,
      name: 'Pets',
      kind: TransactionCategoryKind.EXPENSE,
      color: null,
    });
  });

  it('scopes updates and status changes to the caller', async () => {
    const update = jest.fn().mockResolvedValue(buildTransactionCategory());
    const status = jest.fn().mockResolvedValue(buildTransactionCategory());

    const controller = buildController({
      update: mockOf<UpdateTransactionCategoryUseCase>({ execute: update }),
      status: mockOf<UpdateTransactionCategoryStatusUseCase>({
        execute: status,
      }),
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
      remove: mockOf<DeleteTransactionCategoryUseCase>({ execute }),
    });

    await controller.remove('category-uuid', actor);

    expect(execute).toHaveBeenCalledWith({
      uuid: 'category-uuid',
      ownerId: 31,
    });
  });
});
