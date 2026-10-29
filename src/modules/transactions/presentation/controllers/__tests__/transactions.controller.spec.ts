import { TransactionCategoryKind } from '@modules/transaction-categories';
import { PaginatedResult } from '@shared/application/dto';
import type { Translate } from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { buildAccount } from '@test/support/builders/account.builder';
import { buildTransactionCategory } from '@test/support/builders/transaction-category.builder';
import { buildTransaction } from '@test/support/builders/transaction.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { CreateTransactionUseCase } from '../../../application/use-cases/create-transaction.use-case';
import type { DeleteTransactionUseCase } from '../../../application/use-cases/delete-transaction.use-case';
import type { GetTransactionUseCase } from '../../../application/use-cases/get-transaction.use-case';
import type { ListTransactionsUseCase } from '../../../application/use-cases/list-transactions.use-case';
import type { UpdateTransactionStateUseCase } from '../../../application/use-cases/update-transaction-state.use-case';
import type { UpdateTransactionUseCase } from '../../../application/use-cases/update-transaction.use-case';
import { TransactionState } from '../../../domain/enums/transaction-state.enum';
import { TransactionType } from '../../../domain/enums/transaction-type.enum';
import { CreateTransactionDto } from '../../dto/input/create-transaction.dto';
import { ListTransactionsQueryDto } from '../../dto/input/list-transactions-query.dto';
import { UpdateTransactionStateDto } from '../../dto/input/update-transaction-state.dto';
import { UpdateTransactionDto } from '../../dto/input/update-transaction.dto';
import { TransactionsController } from '../transactions.controller';

const translate: Translate = (key) =>
  key === 'transaction_categories.global.food' ? 'Alimentação' : `t:${key}`;

const actor: AuthenticatedUser = {
  id: 21,
  uuid: 'actor-uuid',
  email: 'actor@example.com',
  name: 'Actor',
  roles: ['ADMIN'],
};

function buildController(
  overrides: Partial<{
    list: ListTransactionsUseCase;
    get: GetTransactionUseCase;
    create: CreateTransactionUseCase;
    update: UpdateTransactionUseCase;
    state: UpdateTransactionStateUseCase;
    remove: DeleteTransactionUseCase;
  }> = {},
) {
  return new TransactionsController(
    overrides.list ?? mockOf<ListTransactionsUseCase>(),
    overrides.get ?? mockOf<GetTransactionUseCase>(),
    overrides.create ?? mockOf<CreateTransactionUseCase>(),
    overrides.update ?? mockOf<UpdateTransactionUseCase>(),
    overrides.state ?? mockOf<UpdateTransactionStateUseCase>(),
    overrides.remove ?? mockOf<DeleteTransactionUseCase>(),
  );
}

describe('TransactionsController', () => {
  it('serializes a transaction with labels, decimal amounts, and its references', async () => {
    const execute = jest.fn().mockResolvedValue(
      buildTransaction({
        amount: 102080,
        category: buildTransactionCategory({
          ownerId: null,
          code: 'FOOD',
          name: 'Food',
          kind: TransactionCategoryKind.EXPENSE,
          color: null,
        }),
      }),
    );

    const controller = buildController({
      get: mockOf<GetTransactionUseCase>({ execute }),
    });

    const result = await controller.findOne(
      'transaction-uuid',
      actor,
      translate,
    );

    expect(execute).toHaveBeenCalledWith('transaction-uuid', 21);
    expect(result).toMatchObject({
      type: TransactionType.EXPENSE,
      typeLabel: 't:transactions.type.expense',
      amount: '1020.80',
      state: TransactionState.PLANNED,
      stateLabel: 't:transactions.state.planned',
      completedOn: null,
      canceledAt: null,
      account: { uuid: 'account-uuid', name: 'Checking', status: 'ACTIVE' },
      destinationAccount: null,
      category: {
        name: 'Alimentação',
        kind: TransactionCategoryKind.EXPENSE,
        color: null,
        status: 'ACTIVE',
      },
      notes: null,
    });
  });

  it('serializes a transfer with its destination and without a category', async () => {
    const execute = jest.fn().mockResolvedValue(
      PaginatedResult.of(
        [
          buildTransaction({
            type: TransactionType.TRANSFER,
            category: null,
            destinationAccount: buildAccount({ id: 2, uuid: 'savings' }),
          }),
        ],
        1,
        1,
        20,
      ),
    );

    const controller = buildController({
      list: mockOf<ListTransactionsUseCase>({ execute }),
    });

    const result = await controller.findAll(
      Object.assign(new ListTransactionsQueryDto(), {
        from: '2026-10-01',
        to: '2026-10-31',
        accountUuid: 'savings',
      }),
      actor,
      translate,
    );

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 21,
        page: 1,
        limit: 20,
        from: '2026-10-01',
        to: '2026-10-31',
        accountUuid: 'savings',
      }),
    );
    expect(result.items[0]).toMatchObject({
      category: null,
      destinationAccount: { uuid: 'savings' },
    });
  });

  it('creates a transaction with the amount in cents for the caller', async () => {
    const execute = jest.fn().mockResolvedValue(buildTransaction());

    const controller = buildController({
      create: mockOf<CreateTransactionUseCase>({ execute }),
    });

    await controller.create(
      Object.assign(new CreateTransactionDto(), {
        type: TransactionType.EXPENSE,
        description: 'Market',
        amount: '250.40',
        date: '2026-10-29',
        state: TransactionState.PLANNED,
        accountUuid: 'source',
        categoryUuid: 'groceries',
      }),
      actor,
      translate,
    );

    expect(execute).toHaveBeenCalledWith({
      ownerId: 21,
      type: TransactionType.EXPENSE,
      description: 'Market',
      amount: 25040,
      date: '2026-10-29',
      state: TransactionState.PLANNED,
      completedOn: undefined,
      accountUuid: 'source',
      destinationAccountUuid: undefined,
      categoryUuid: 'groceries',
      notes: null,
    });
  });

  it('passes only the sent fields of a partial update', async () => {
    const execute = jest.fn().mockResolvedValue(buildTransaction());

    const controller = buildController({
      update: mockOf<UpdateTransactionUseCase>({ execute }),
    });

    await controller.update(
      'transaction-uuid',
      Object.assign(new UpdateTransactionDto(), {
        amount: '1.50',
        notes: null,
      }),
      actor,
      translate,
    );

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        uuid: 'transaction-uuid',
        ownerId: 21,
        amount: 150,
        notes: null,
        description: undefined,
      }),
    );
  });

  it('changes the state of a transaction', async () => {
    const execute = jest.fn().mockResolvedValue(
      buildTransaction({
        state: TransactionState.COMPLETED,
        completedOn: '2026-10-29',
      }),
    );

    const controller = buildController({
      state: mockOf<UpdateTransactionStateUseCase>({ execute }),
    });

    const result = await controller.updateState(
      'transaction-uuid',
      Object.assign(new UpdateTransactionStateDto(), {
        state: TransactionState.COMPLETED,
      }),
      actor,
      translate,
    );

    expect(execute).toHaveBeenCalledWith({
      uuid: 'transaction-uuid',
      ownerId: 21,
      state: TransactionState.COMPLETED,
      completedOn: undefined,
    });
    expect(result.completedOn).toBe('2026-10-29');
  });

  it('deletes a transaction of the caller', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);

    const controller = buildController({
      remove: mockOf<DeleteTransactionUseCase>({ execute }),
    });

    await controller.remove('transaction-uuid', actor);

    expect(execute).toHaveBeenCalledWith({
      uuid: 'transaction-uuid',
      ownerId: 21,
    });
  });
});
