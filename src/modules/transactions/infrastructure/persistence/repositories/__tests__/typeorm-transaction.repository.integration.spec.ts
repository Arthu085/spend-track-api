import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { AccountEntity } from '@modules/accounts/domain/entities/account.entity';
import { AccountType } from '@modules/accounts/domain/enums/account-type.enum';
import { AccountOrmEntity } from '@modules/accounts/infrastructure/persistence/entities/account.orm-entity';
import { TypeOrmAccountRepository } from '@modules/accounts/infrastructure/persistence/repositories/typeorm-account.repository';
import { TransactionCategoryEntity } from '@modules/transaction-categories/domain/entities/transaction-category.entity';
import { TransactionCategoryKind } from '@modules/transaction-categories/domain/enums/transaction-category-kind.enum';
import { TransactionCategoryOrmEntity } from '@modules/transaction-categories/infrastructure/persistence/entities/transaction-category.orm-entity';
import { TypeOrmTransactionCategoryRepository } from '@modules/transaction-categories/infrastructure/persistence/repositories/typeorm-transaction-category.repository';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import {
  TransactionEntity,
  type CreateTransactionInput,
} from '../../../../domain/entities/transaction.entity';
import { TransactionState } from '../../../../domain/enums/transaction-state.enum';
import { TransactionType } from '../../../../domain/enums/transaction-type.enum';
import { TransactionOrmEntity } from '../../entities/transaction.orm-entity';
import { TypeOrmTransactionRepository } from '../typeorm-transaction.repository';

describe('TypeOrmTransactionRepository (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let repository: TypeOrmTransactionRepository;
  let accounts: TypeOrmAccountRepository;
  let categories: TypeOrmTransactionCategoryRepository;
  let transactionManager: TransactionManagerPort;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([
          TransactionOrmEntity,
          AccountOrmEntity,
          TransactionCategoryOrmEntity,
          UserOrmEntity,
        ]),
      ],
      providers: [
        TypeOrmTransactionRepository,
        TypeOrmAccountRepository,
        TypeOrmTransactionCategoryRepository,
      ],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    repository = moduleRef.get(TypeOrmTransactionRepository);
    accounts = moduleRef.get(TypeOrmAccountRepository);
    categories = moduleRef.get(TypeOrmTransactionCategoryRepository);
    transactionManager = moduleRef.get(TRANSACTION_MANAGER);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "transactions", "accounts", "users" RESTART IDENTITY CASCADE',
    );
    await dataSource.query(
      'DELETE FROM "transaction_categories" WHERE "user_id" IS NOT NULL',
    );
  });

  interface Fixture {
    ownerId: number;
    bank: AccountEntity;
    wallet: AccountEntity;
    groceries: TransactionCategoryEntity;
    salary: TransactionCategoryEntity;
  }

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

  async function fixture(): Promise<Fixture> {
    const ownerId = await insertUser();

    const account = (name: string) =>
      accounts.create(
        AccountEntity.create({
          uuid: randomUUID(),
          ownerId,
          name,
          type: AccountType.CHECKING,
          openingBalance: 0,
          openingBalanceDate: '2026-10-01',
          isDefault: false,
        }),
      );

    const category = (name: string, kind: TransactionCategoryKind) =>
      categories.create(
        TransactionCategoryEntity.createPersonal({
          uuid: randomUUID(),
          ownerId,
          name,
          kind,
          color: null,
        }),
      );

    return {
      ownerId,
      bank: await account('Bank'),
      wallet: await account('Wallet'),
      groceries: await category('Groceries', TransactionCategoryKind.EXPENSE),
      salary: await category('Salary', TransactionCategoryKind.INCOME),
    };
  }

  function record(
    f: Fixture,
    overrides: Partial<CreateTransactionInput> = {},
  ): Promise<TransactionEntity> {
    return repository.create(
      TransactionEntity.create({
        uuid: randomUUID(),
        ownerId: f.ownerId,
        type: TransactionType.EXPENSE,
        description: 'Market',
        amount: 10000,
        date: '2026-10-10',
        state: TransactionState.COMPLETED,
        completedOn: null,
        account: f.bank,
        destinationAccount: null,
        category: f.groceries,
        notes: null,
        ...overrides,
      }),
    );
  }

  function income(f: Fixture, overrides: Partial<CreateTransactionInput>) {
    return record(f, {
      type: TransactionType.INCOME,
      category: f.salary,
      ...overrides,
    });
  }

  function transfer(f: Fixture, overrides: Partial<CreateTransactionInput>) {
    return record(f, {
      type: TransactionType.TRANSFER,
      category: null,
      destinationAccount: f.wallet,
      ...overrides,
    });
  }

  it('stores a transaction exactly and reads it back with its references', async () => {
    const f = await fixture();

    const created = await record(f, { amount: 102080, notes: 'weekly' });

    const found = await repository.findByUuidForOwner(created.uuid, f.ownerId);

    expect(found).toMatchObject({
      amount: 102080,
      date: '2026-10-10',
      completedOn: '2026-10-10',
      notes: 'weekly',
    });
    expect(found?.account.uuid).toBe(f.bank.uuid);
    expect(found?.category?.uuid).toBe(f.groceries.uuid);
  });

  it("never returns another user's transaction", async () => {
    const f = await fixture();
    const stranger = await insertUser();
    const created = await record(f);

    await expect(
      repository.findByUuidForOwner(created.uuid, stranger),
    ).resolves.toBeNull();
    await expect(
      repository.findAllPaginatedByOwner(stranger, 0, 20),
    ).resolves.toEqual({ items: [], total: 0 });
  });

  it('keeps showing a soft-deleted category on its transactions', async () => {
    const f = await fixture();
    const created = await record(f);

    await categories.softDelete(f.groceries);

    const found = await repository.findByUuidForOwner(created.uuid, f.ownerId);

    expect(found?.category?.uuid).toBe(f.groceries.uuid);
    expect(found?.category?.deletedAt).not.toBeNull();
  });

  it('computes balance changes per account from the selected state only', async () => {
    const f = await fixture();
    await income(f, { amount: 500000 });
    await record(f, { amount: 12345 });
    await transfer(f, { amount: 20000 });
    await record(f, { amount: 999, state: TransactionState.PLANNED });
    const canceled = await record(f, { amount: 777 });
    await repository.update(canceled.cancel());

    const deleted = await record(f, {
      amount: 555,
      state: TransactionState.PLANNED,
    });

    await repository.softDelete(deleted);

    const completed = await repository.sumBalanceChanges(
      f.ownerId,
      [f.bank.id, f.wallet.id],
      { state: TransactionState.COMPLETED },
    );

    expect(completed).toEqual(
      new Map([
        [f.bank.id, 500000 - 12345 - 20000],
        [f.wallet.id, 20000],
      ]),
    );

    const planned = await repository.sumBalanceChanges(f.ownerId, [f.bank.id], {
      state: TransactionState.PLANNED,
      until: '2026-10-31',
    });

    expect(planned).toEqual(new Map([[f.bank.id, -999]]));
    await expect(
      repository.sumBalanceChanges(f.ownerId, [], {
        state: TransactionState.COMPLETED,
      }),
    ).resolves.toEqual(new Map());
  });

  it('limits planned balance changes to the given date', async () => {
    const f = await fixture();
    await record(f, { state: TransactionState.PLANNED, date: '2026-12-01' });

    await expect(
      repository.sumBalanceChanges(f.ownerId, [f.bank.id], {
        state: TransactionState.PLANNED,
        until: '2026-11-30',
      }),
    ).resolves.toEqual(new Map());
  });

  it('reports whether any live transaction references an account', async () => {
    const f = await fixture();

    await expect(
      repository.existsForAccount(f.ownerId, f.wallet.id),
    ).resolves.toBe(false);

    await transfer(f, { state: TransactionState.PLANNED });

    await expect(
      repository.existsForAccount(f.ownerId, f.wallet.id),
    ).resolves.toBe(true);
  });

  it('sums income and expenses of a period by state, ignoring transfers and canceled ones', async () => {
    const f = await fixture();
    await income(f, { amount: 300000 });
    await income(f, { amount: 200000, state: TransactionState.PLANNED });
    await record(f, { amount: 8000 });
    await record(f, { amount: 4000, state: TransactionState.PLANNED });
    await record(f, { amount: 1, date: '2026-11-01' });
    await transfer(f, { amount: 7000 });
    const canceled = await record(f, { amount: 50 });
    await repository.update(canceled.cancel());

    const totals = await repository.sumByTypeAndState(f.ownerId, {
      from: '2026-10-01',
      to: '2026-10-31',
    });

    expect(
      totals.sort((a, b) =>
        `${a.type}${a.state}`.localeCompare(`${b.type}${b.state}`),
      ),
    ).toEqual([
      {
        type: TransactionType.EXPENSE,
        state: TransactionState.COMPLETED,
        total: 8000,
      },
      {
        type: TransactionType.EXPENSE,
        state: TransactionState.PLANNED,
        total: 4000,
      },
      {
        type: TransactionType.INCOME,
        state: TransactionState.COMPLETED,
        total: 300000,
      },
      {
        type: TransactionType.INCOME,
        state: TransactionState.PLANNED,
        total: 200000,
      },
    ]);
  });

  it('sums expenses by category, including archived categories', async () => {
    const f = await fixture();
    await record(f, { amount: 300 });
    await record(f, { amount: 200, state: TransactionState.PLANNED });
    await categories.softDelete(f.groceries);

    const totals = await repository.sumExpensesByCategory(f.ownerId, {
      from: '2026-10-01',
      to: '2026-10-31',
    });

    expect(
      totals
        .map(({ category, state, total }) => [category.uuid, state, total])
        .sort(),
    ).toEqual(
      [
        [f.groceries.uuid, TransactionState.COMPLETED, 300],
        [f.groceries.uuid, TransactionState.PLANNED, 200],
      ].sort(),
    );
    await expect(
      repository.sumExpensesByCategory(f.ownerId, {
        from: '2027-01-01',
        to: '2027-01-31',
      }),
    ).resolves.toEqual([]);
  });

  it('lists planned transactions up to a date, oldest first, with the total count', async () => {
    const f = await fixture();

    const late = await record(f, {
      state: TransactionState.PLANNED,
      date: '2026-09-15',
    });

    const due = await record(f, {
      state: TransactionState.PLANNED,
      date: '2026-10-20',
    });

    await record(f, { state: TransactionState.PLANNED, date: '2026-10-25' });
    await record(f, { state: TransactionState.PLANNED, date: '2026-11-02' });
    await record(f, { date: '2026-10-01' });

    const upcoming = await repository.findPlannedUntil(
      f.ownerId,
      '2026-10-31',
      2,
    );

    expect(upcoming.items.map((item) => item.uuid)).toEqual([
      late.uuid,
      due.uuid,
    ]);
    expect(upcoming.total).toBe(3);
  });

  it('filters the list and orders it by date, newest first', async () => {
    const f = await fixture();

    const older = await record(f, {
      description: 'Market A',
      date: '2026-10-01',
    });

    const newer = await record(f, {
      description: 'Market B',
      date: '2026-10-20',
    });

    const moved = await transfer(f, {
      description: 'Savings',
      date: '2026-10-05',
    });

    await record(f, { description: 'Market C', date: '2026-11-02' });

    const october = await repository.findAllPaginatedByOwner(f.ownerId, 0, 20, {
      from: '2026-10-01',
      to: '2026-10-31',
    });

    expect(october.items.map((item) => item.uuid)).toEqual([
      newer.uuid,
      moved.uuid,
      older.uuid,
    ]);

    const intoWallet = await repository.findAllPaginatedByOwner(
      f.ownerId,
      0,
      20,
      { accountUuid: f.wallet.uuid },
    );

    expect(intoWallet.items.map((item) => item.uuid)).toEqual([moved.uuid]);

    const filtered = await repository.findAllPaginatedByOwner(
      f.ownerId,
      0,
      20,
      {
        description: 'market',
        type: TransactionType.EXPENSE,
        state: TransactionState.COMPLETED,
        categoryUuid: f.groceries.uuid,
        to: '2026-10-31',
      },
    );

    expect(filtered.total).toBe(2);
    await expect(
      repository.findAllPaginatedByOwner(f.ownerId, 0, 20, {
        accountUuid: randomUUID(),
      }),
    ).resolves.toEqual({ items: [], total: 0 });
  });

  it('locks the transaction row it loads for an update', async () => {
    const f = await fixture();
    const created = await record(f, { state: TransactionState.PLANNED });

    const locked = await transactionManager.runInTransaction(() =>
      repository.findByUuidForOwnerForUpdate(created.uuid, f.ownerId),
    );

    expect(locked?.uuid).toBe(created.uuid);
  });

  it('hides a soft-deleted transaction', async () => {
    const f = await fixture();
    const created = await record(f, { state: TransactionState.PLANNED });

    await repository.softDelete(created);

    await expect(
      repository.findByUuidForOwner(created.uuid, f.ownerId),
    ).resolves.toBeNull();
  });

  it.each([
    ['a non-positive amount', `"amount" = 0`],
    [
      'a completed transaction without an effective date',
      `"completed_on" = NULL`,
    ],
    [
      'an expense with a destination account',
      `"destination_account_id" = "account_id"`,
    ],
    ['an expense without a category', `"category_id" = NULL`],
    ['a canceled date on a live transaction', `"canceled_at" = now()`],
  ])('rejects %s at the database level', async (_, assignment) => {
    const f = await fixture();
    const created = await record(f);

    await expect(
      dataSource.query(
        `UPDATE "transactions" SET ${assignment} WHERE "id" = $1`,
        [created.id],
      ),
    ).rejects.toBeInstanceOf(QueryFailedError);
  });
});
