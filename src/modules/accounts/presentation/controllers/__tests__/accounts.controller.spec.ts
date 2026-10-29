import type { Translate } from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildAccount } from '@test/support/builders/account.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { CreateAccountUseCase } from '../../../application/use-cases/create-account.use-case';
import type { DeleteAccountUseCase } from '../../../application/use-cases/delete-account.use-case';
import type { GetAccountUseCase } from '../../../application/use-cases/get-account.use-case';
import type { ListAccountsUseCase } from '../../../application/use-cases/list-accounts.use-case';
import type { UpdateAccountStatusUseCase } from '../../../application/use-cases/update-account-status.use-case';
import type { UpdateAccountUseCase } from '../../../application/use-cases/update-account.use-case';
import { AccountType } from '../../../domain/enums/account-type.enum';
import { AccountsController } from '../accounts.controller';

const translate: Translate = (key) => `t:${key}`;

const actor: AuthenticatedUser = {
  id: 21,
  uuid: 'actor-uuid',
  email: 'actor@example.com',
  name: 'Actor',
  roles: ['USER'],
};

function buildController(
  overrides: Partial<{
    list: ListAccountsUseCase;
    get: GetAccountUseCase;
    create: CreateAccountUseCase;
    update: UpdateAccountUseCase;
    status: UpdateAccountStatusUseCase;
    remove: DeleteAccountUseCase;
  }> = {},
) {
  return new AccountsController(
    overrides.list ?? mockOf<ListAccountsUseCase>(),
    overrides.get ?? mockOf<GetAccountUseCase>(),
    overrides.create ?? mockOf<CreateAccountUseCase>(),
    overrides.update ?? mockOf<UpdateAccountUseCase>(),
    overrides.status ?? mockOf<UpdateAccountStatusUseCase>(),
    overrides.remove ?? mockOf<DeleteAccountUseCase>(),
  );
}

describe('AccountsController', () => {
  it('serializes amounts as decimal strings with localized labels', async () => {
    const execute = jest
      .fn()
      .mockResolvedValue(buildAccount({ openingBalance: -2050 }));

    const controller = buildController({
      get: mockOf<GetAccountUseCase>({ execute }),
    });

    const result = await controller.findOne('account-uuid', actor, translate);

    expect(execute).toHaveBeenCalledWith('account-uuid', 21);
    expect(result).toMatchObject({
      uuid: 'account-uuid',
      type: AccountType.CHECKING,
      typeLabel: 't:accounts.type.checking',
      openingBalance: '-20.50',
      currentBalance: '-20.50',
      statusLabel: 't:enums.record_status.active',
    });
  });

  it('lists the accounts of the caller with the sent filters', async () => {
    const execute = jest.fn().mockResolvedValue([buildAccount()]);

    const controller = buildController({
      list: mockOf<ListAccountsUseCase>({ execute }),
    });

    const result = await controller.findAll(
      { status: RecordStatus.INACTIVE, type: AccountType.CASH },
      actor,
      translate,
    );

    expect(execute).toHaveBeenCalledWith({
      ownerId: 21,
      name: undefined,
      type: AccountType.CASH,
      status: RecordStatus.INACTIVE,
    });
    expect(result).toHaveLength(1);
  });

  it('creates an account owned by the caller with the balance in cents', async () => {
    const execute = jest.fn().mockResolvedValue(buildAccount());

    const controller = buildController({
      create: mockOf<CreateAccountUseCase>({ execute }),
    });

    await controller.create(
      {
        name: 'Bank',
        type: AccountType.CHECKING,
        openingBalance: '10.5',
        openingBalanceDate: '2026-10-01',
      },
      actor,
      translate,
    );

    expect(execute).toHaveBeenCalledWith({
      ownerId: 21,
      name: 'Bank',
      type: AccountType.CHECKING,
      openingBalance: 1050,
      openingBalanceDate: '2026-10-01',
      isDefault: false,
    });
  });

  it('forwards only the sent fields on update', async () => {
    const execute = jest.fn().mockResolvedValue(buildAccount());

    const controller = buildController({
      update: mockOf<UpdateAccountUseCase>({ execute }),
    });

    await controller.update(
      'account-uuid',
      { isDefault: true },
      actor,
      translate,
    );

    expect(execute).toHaveBeenCalledWith({
      uuid: 'account-uuid',
      ownerId: 21,
      name: undefined,
      type: undefined,
      openingBalance: undefined,
      openingBalanceDate: undefined,
      isDefault: true,
    });
  });

  it('scopes status changes and deletes to the caller', async () => {
    const statusExecute = jest.fn().mockResolvedValue(buildAccount());
    const deleteExecute = jest.fn().mockResolvedValue(undefined);

    const controller = buildController({
      status: mockOf<UpdateAccountStatusUseCase>({ execute: statusExecute }),
      remove: mockOf<DeleteAccountUseCase>({ execute: deleteExecute }),
    });

    await controller.updateStatus(
      'account-uuid',
      { status: RecordStatus.INACTIVE },
      actor,
      translate,
    );
    await controller.remove('account-uuid', actor);

    expect(statusExecute).toHaveBeenCalledWith({
      uuid: 'account-uuid',
      ownerId: 21,
      status: RecordStatus.INACTIVE,
    });
    expect(deleteExecute).toHaveBeenCalledWith({
      uuid: 'account-uuid',
      ownerId: 21,
    });
  });
});
