import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { AccountEntity } from '../../../../domain/entities/account.entity';
import { AccountType } from '../../../../domain/enums/account-type.enum';
import { AccountOrmEntity } from '../../entities/account.orm-entity';
import { TypeOrmAccountRepository } from '../typeorm-account.repository';

describe('TypeOrmAccountRepository (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let repository: TypeOrmAccountRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([AccountOrmEntity, UserOrmEntity]),
      ],
      providers: [TypeOrmAccountRepository],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    repository = moduleRef.get(TypeOrmAccountRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "accounts", "users" RESTART IDENTITY CASCADE',
    );
  });

  async function insertUser(): Promise<number> {
    const users = dataSource.getRepository(UserOrmEntity);

    const user = await users.save(
      users.create({
        name: 'Owner',
        email: `${randomUUID()}@example.com`,
        password: 'hash',
      }),
    );

    return user.id;
  }

  function newAccount(
    ownerId: number,
    name: string,
    isDefault = false,
  ): AccountEntity {
    return AccountEntity.create({
      uuid: randomUUID(),
      ownerId,
      name,
      type: AccountType.CHECKING,
      openingBalance: 123456789,
      openingBalanceDate: '2026-10-01',
      isDefault,
    });
  }

  it('stores money exactly and reads it back in cents', async () => {
    const ownerId = await insertUser();

    const created = await repository.create(newAccount(ownerId, 'Bank'));

    expect(created.id).toBeGreaterThan(0);
    expect(created.openingBalance).toBe(123456789);
    expect(created.openingBalanceDate).toBe('2026-10-01');
  });

  it("never returns another user's account", async () => {
    const owner = await insertUser();
    const stranger = await insertUser();
    const account = await repository.create(newAccount(owner, 'Bank'));

    await expect(
      repository.findByUuidForOwner(account.uuid, stranger),
    ).resolves.toBeNull();
    await expect(repository.findAllByOwner(stranger)).resolves.toEqual([]);
    await expect(
      repository.findByUuidForOwner(account.uuid, owner),
    ).resolves.toMatchObject({ uuid: account.uuid });
  });

  it('lists the default account first, then by name, with filters', async () => {
    const ownerId = await insertUser();
    await repository.create(newAccount(ownerId, 'Wallet'));
    await repository.create(newAccount(ownerId, 'Bank'));
    await repository.create(newAccount(ownerId, 'Savings', true));
    const archived = await repository.create(newAccount(ownerId, 'Old'));
    await repository.update(archived.withStatus(RecordStatus.INACTIVE));

    const active = await repository.findAllByOwner(ownerId, {
      status: RecordStatus.ACTIVE,
    });

    expect(active.map((account) => account.name)).toEqual([
      'Savings',
      'Bank',
      'Wallet',
    ]);
    await expect(
      repository.findAllByOwner(ownerId, { name: 'ban' }),
    ).resolves.toHaveLength(1);
  });

  it('pages accounts in list order and counts every match', async () => {
    const ownerId = await insertUser();
    await repository.create(newAccount(ownerId, 'Wallet'));
    await repository.create(newAccount(ownerId, 'Bank'));
    await repository.create(newAccount(ownerId, 'Savings', true));

    const secondPage = await repository.findAllPaginatedByOwner(ownerId, 2, 2, {
      status: RecordStatus.ACTIVE,
    });

    expect(secondPage.items.map((account) => account.name)).toEqual(['Wallet']);
    expect(secondPage.total).toBe(3);
  });

  it('allows at most one live default account per user', async () => {
    const ownerId = await insertUser();
    await repository.create(newAccount(ownerId, 'First', true));

    await expect(
      repository.create(newAccount(ownerId, 'Second', true)),
    ).rejects.toBeInstanceOf(QueryFailedError);

    await repository.clearDefault(ownerId);
    await repository.create(newAccount(ownerId, 'Second', true));

    const accounts = await repository.findAllByOwner(ownerId);

    expect(
      accounts.filter((account) => account.isDefault).map((a) => a.name),
    ).toEqual(['Second']);
  });

  it('only clears the default of the given user', async () => {
    const owner = await insertUser();
    const other = await insertUser();
    await repository.create(newAccount(owner, 'Mine', true));
    await repository.create(newAccount(other, 'Theirs', true));

    await repository.clearDefault(owner);

    const [theirs] = await repository.findAllByOwner(other);

    expect(theirs.isDefault).toBe(true);
  });

  it('soft-deletes an account and drops its default flag', async () => {
    const ownerId = await insertUser();
    const account = await repository.create(newAccount(ownerId, 'Bank', true));

    await repository.softDelete(account);

    await expect(
      repository.findByUuidForOwner(account.uuid, ownerId),
    ).resolves.toBeNull();

    const row = await dataSource
      .getRepository(AccountOrmEntity)
      .findOneOrFail({ where: { id: account.id }, withDeleted: true });

    expect(row.deletedAt).not.toBeNull();
    expect(row.isDefault).toBe(false);
  });

  it('serializes account writes per user with an advisory lock', async () => {
    const ownerId = await insertUser();

    await expect(
      dataSource.transaction(async () => {
        await repository.lockOwnerAccounts(ownerId);
      }),
    ).resolves.toBeUndefined();
  });
});
