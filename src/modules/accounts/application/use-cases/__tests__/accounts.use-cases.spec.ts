import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import type { TransactionManagerPort } from '@shared/application/ports';
import { buildAccount } from '@test/support/builders/account.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { AccountEntity } from '../../../domain/entities/account.entity';
import { AccountType } from '../../../domain/enums/account-type.enum';
import { AccountNotFoundError } from '../../../domain/errors/account-not-found.error';
import { InactiveAccountError } from '../../../domain/errors/inactive-account.error';
import type { AccountRepository } from '../../../domain/repositories/account.repository';
import { CreateAccountUseCase } from '../create-account.use-case';
import { DeleteAccountUseCase } from '../delete-account.use-case';
import { GetAccountUseCase } from '../get-account.use-case';
import { ListAccountsUseCase } from '../list-accounts.use-case';
import { UpdateAccountStatusUseCase } from '../update-account-status.use-case';
import { UpdateAccountUseCase } from '../update-account.use-case';

const transactionManager: TransactionManagerPort = {
  runInTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
  runInSavepoint: <T>(work: () => Promise<T>): Promise<T> => work(),
};

function buildRepository(found: AccountEntity | null = buildAccount()) {
  const calls: string[] = [];

  const track =
    <T>(name: string, result: (arg: AccountEntity) => T) =>
    (arg: AccountEntity): T => {
      calls.push(name);
      return result(arg);
    };

  const repository = {
    findAllByOwner: jest.fn().mockResolvedValue([]),
    findByUuidForOwner: jest.fn().mockResolvedValue(found),
    lockOwnerAccounts: jest.fn(() => {
      calls.push('lock');
      return Promise.resolve();
    }),
    clearDefault: jest.fn(() => {
      calls.push('clear');
      return Promise.resolve();
    }),
    create: jest.fn(track('create', (account) => Promise.resolve(account))),
    update: jest.fn(track('update', (account) => Promise.resolve(account))),
    softDelete: jest.fn(track('delete', () => Promise.resolve())),
  };

  return { repository, port: mockOf<AccountRepository>(repository), calls };
}

describe('accounts use-cases', () => {
  describe('ListAccountsUseCase', () => {
    it("lists only the caller's active accounts by default", async () => {
      const { repository, port } = buildRepository();

      await new ListAccountsUseCase(port).execute({
        ownerId: 4,
        name: '  bank ',
      });

      expect(repository.findAllByOwner).toHaveBeenCalledWith(4, {
        name: 'bank',
        type: undefined,
        status: RecordStatus.ACTIVE,
      });
    });
  });

  describe('GetAccountUseCase', () => {
    it('looks the account up within the caller ownership', async () => {
      const { repository, port } = buildRepository();

      await new GetAccountUseCase(port).execute('account-uuid', 4);

      expect(repository.findByUuidForOwner).toHaveBeenCalledWith(
        'account-uuid',
        4,
      );
    });

    // Another user's account is reported exactly like a missing one, so its
    // existence never leaks, whatever the caller's roles.
    it('reports an account outside the caller ownership as not found', async () => {
      const { port } = buildRepository(null);

      await expect(
        new GetAccountUseCase(port).execute('account-uuid', 4),
      ).rejects.toBeInstanceOf(AccountNotFoundError);
    });

    it('rejects an archived account', async () => {
      const { port } = buildRepository(
        buildAccount({ status: RecordStatus.INACTIVE }),
      );

      await expect(
        new GetAccountUseCase(port).execute('account-uuid', 4),
      ).rejects.toBeInstanceOf(InactiveAccountError);
    });
  });

  describe('CreateAccountUseCase', () => {
    const input = {
      ownerId: 4,
      name: 'Bank',
      type: AccountType.CHECKING,
      openingBalance: 5000,
      openingBalanceDate: '2026-10-01',
    };

    it('creates an account owned by the caller', async () => {
      const { port, calls } = buildRepository();

      const account = await new CreateAccountUseCase(
        port,
        transactionManager,
      ).execute({ ...input, isDefault: false });

      expect(account.ownerId).toBe(4);
      expect(account.uuid).toMatch(/^[0-9a-f-]{36}$/);
      expect(calls).toEqual(['create']);
    });

    it('clears the previous default under the lock before creating a new default', async () => {
      const { repository, port, calls } = buildRepository();

      await new CreateAccountUseCase(port, transactionManager).execute({
        ...input,
        isDefault: true,
      });

      expect(calls).toEqual(['lock', 'clear', 'create']);
      expect(repository.clearDefault).toHaveBeenCalledWith(4);
    });
  });

  describe('UpdateAccountUseCase', () => {
    it('keeps omitted fields and applies the sent ones', async () => {
      const { port, calls } = buildRepository();

      const updated = await new UpdateAccountUseCase(
        port,
        transactionManager,
      ).execute({ uuid: 'account-uuid', ownerId: 1, name: 'Renamed' });

      expect(updated).toMatchObject({
        name: 'Renamed',
        type: AccountType.CHECKING,
        openingBalance: 100000,
        isDefault: false,
      });
      expect(calls).toEqual(['lock', 'update']);
    });

    it('clears the previous default when the account becomes the default', async () => {
      const { port, calls } = buildRepository();

      const updated = await new UpdateAccountUseCase(
        port,
        transactionManager,
      ).execute({ uuid: 'account-uuid', ownerId: 1, isDefault: true });

      expect(updated.isDefault).toBe(true);
      expect(calls).toEqual(['lock', 'clear', 'update']);
    });

    it('does not clear anything when the account already is the default', async () => {
      const { port, calls } = buildRepository(
        buildAccount({ isDefault: true }),
      );

      await new UpdateAccountUseCase(port, transactionManager).execute({
        uuid: 'account-uuid',
        ownerId: 1,
        isDefault: true,
      });

      expect(calls).toEqual(['lock', 'update']);
    });

    it('rejects an account outside the caller ownership', async () => {
      const { port, calls } = buildRepository(null);

      await expect(
        new UpdateAccountUseCase(port, transactionManager).execute({
          uuid: 'account-uuid',
          ownerId: 2,
          name: 'Stolen',
        }),
      ).rejects.toBeInstanceOf(AccountNotFoundError);
      expect(calls).toEqual(['lock']);
    });

    it('rejects an archived account', async () => {
      const { port } = buildRepository(
        buildAccount({ status: RecordStatus.INACTIVE }),
      );

      await expect(
        new UpdateAccountUseCase(port, transactionManager).execute({
          uuid: 'account-uuid',
          ownerId: 1,
          name: 'Renamed',
        }),
      ).rejects.toBeInstanceOf(InactiveAccountError);
    });
  });

  describe('UpdateAccountStatusUseCase', () => {
    it('archives an account under the owner lock and drops its default flag', async () => {
      const { port, calls } = buildRepository(
        buildAccount({ isDefault: true }),
      );

      const archived = await new UpdateAccountStatusUseCase(
        port,
        transactionManager,
      ).execute({
        uuid: 'account-uuid',
        ownerId: 1,
        status: RecordStatus.INACTIVE,
      });

      expect(archived.status).toBe(RecordStatus.INACTIVE);
      expect(archived.isDefault).toBe(false);
      expect(calls).toEqual(['lock', 'update']);
    });

    it('rejects an account outside the caller ownership', async () => {
      const { port } = buildRepository(null);

      await expect(
        new UpdateAccountStatusUseCase(port, transactionManager).execute({
          uuid: 'account-uuid',
          ownerId: 2,
          status: RecordStatus.INACTIVE,
        }),
      ).rejects.toBeInstanceOf(AccountNotFoundError);
    });
  });

  describe('DeleteAccountUseCase', () => {
    it('soft-deletes an owned account under the owner lock', async () => {
      const { port, calls } = buildRepository();

      await new DeleteAccountUseCase(port, transactionManager).execute({
        uuid: 'account-uuid',
        ownerId: 1,
      });

      expect(calls).toEqual(['lock', 'delete']);
    });

    it('rejects an account outside the caller ownership', async () => {
      const { port, calls } = buildRepository(null);

      await expect(
        new DeleteAccountUseCase(port, transactionManager).execute({
          uuid: 'account-uuid',
          ownerId: 2,
        }),
      ).rejects.toBeInstanceOf(AccountNotFoundError);
      expect(calls).toEqual(['lock']);
    });
  });
});
