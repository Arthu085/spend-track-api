import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { TransactionCategoryEntity } from '../../../../domain/entities/transaction-category.entity';
import { TransactionCategoryKind } from '../../../../domain/enums/transaction-category-kind.enum';
import { TransactionCategoryScope } from '../../../../domain/enums/transaction-category-scope.enum';
import { GlobalTransactionCategoriesSeeder } from '../../../seeds/global-transaction-categories.seeder';
import { TransactionCategoryOrmEntity } from '../../entities/transaction-category.orm-entity';
import { TypeOrmTransactionCategoryRepository } from '../typeorm-transaction-category.repository';

describe('TypeOrmTransactionCategoryRepository (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let repository: TypeOrmTransactionCategoryRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([TransactionCategoryOrmEntity, UserOrmEntity]),
      ],
      providers: [TypeOrmTransactionCategoryRepository],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    repository = moduleRef.get(TypeOrmTransactionCategoryRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await new GlobalTransactionCategoriesSeeder().run(dataSource.manager);
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "transaction_categories", "users" RESTART IDENTITY CASCADE',
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

  function personal(ownerId: number, name: string): TransactionCategoryEntity {
    return TransactionCategoryEntity.createPersonal({
      uuid: randomUUID(),
      ownerId,
      kind: TransactionCategoryKind.EXPENSE,
      name,
      color: null,
    });
  }

  it('shows the global catalog plus only the caller own categories', async () => {
    const owner = await insertUser();
    const stranger = await insertUser();
    const mine = await repository.create(personal(owner, 'Pets'));
    const theirs = await repository.create(personal(stranger, 'Secret'));

    const { items: visible, total } =
      await repository.findAllPaginatedVisibleTo(owner, 0, 50);

    const uuids = visible.map((category) => category.uuid);

    expect(total).toBe(17);

    expect(uuids).toContain(mine.uuid);
    expect(uuids).not.toContain(theirs.uuid);
    expect(
      visible.filter(
        (category) => category.scope === TransactionCategoryScope.GLOBAL,
      ),
    ).toHaveLength(16);
    await expect(
      repository.findVisibleByUuid(theirs.uuid, owner),
    ).resolves.toBeNull();
  });

  it('finds a global category for every user', async () => {
    const owner = await insertUser();

    const [food] = await dataSource
      .getRepository(TransactionCategoryOrmEntity)
      .find({ where: { code: 'FOOD' } });

    await expect(
      repository.findVisibleByUuid(food.uuid, owner),
    ).resolves.toMatchObject({ code: 'FOOD', ownerId: null });
  });

  it('filters by scope, kind, and status', async () => {
    const owner = await insertUser();
    const archived = await repository.create(personal(owner, 'Old'));
    await repository.update(archived.withStatus(RecordStatus.INACTIVE));
    await repository.create(personal(owner, 'Pets'));

    const { items: personalActive } =
      await repository.findAllPaginatedVisibleTo(owner, 0, 50, {
        scope: TransactionCategoryScope.PERSONAL,
        status: RecordStatus.ACTIVE,
      });

    const { items: income } = await repository.findAllPaginatedVisibleTo(
      owner,
      0,
      50,
      { kind: TransactionCategoryKind.INCOME },
    );

    expect(personalActive.map((category) => category.name)).toEqual(['Pets']);
    expect(
      income.every(
        (category) => category.kind === TransactionCategoryKind.INCOME,
      ),
    ).toBe(true);
  });

  it('pages the visible categories and counts every match', async () => {
    const owner = await insertUser();

    const firstPage = await repository.findAllPaginatedVisibleTo(owner, 0, 5, {
      kind: TransactionCategoryKind.EXPENSE,
    });

    const lastPage = await repository.findAllPaginatedVisibleTo(owner, 10, 5, {
      kind: TransactionCategoryKind.EXPENSE,
    });

    expect(firstPage.items).toHaveLength(5);
    expect(firstPage.total).toBe(11);
    expect(lastPage.items).toHaveLength(1);
    expect(lastPage.total).toBe(11);
  });

  it('soft-deletes a personal category so it is no longer found or listed', async () => {
    const owner = await insertUser();
    const category = await repository.create(personal(owner, 'Temporary'));

    await repository.softDelete(category);

    await expect(
      repository.findVisibleByUuid(category.uuid, owner),
    ).resolves.toBeNull();

    const { items } = await repository.findAllPaginatedVisibleTo(owner, 0, 50, {
      scope: TransactionCategoryScope.PERSONAL,
    });

    expect(items.map(({ uuid }) => uuid)).not.toContain(category.uuid);

    const row = await dataSource
      .getRepository(TransactionCategoryOrmEntity)
      .findOneOrFail({ where: { uuid: category.uuid }, withDeleted: true });

    expect(row.deletedAt).not.toBeNull();
  });

  it('rejects a personal category that carries a catalog code', async () => {
    const owner = await insertUser();
    const rows = dataSource.getRepository(TransactionCategoryOrmEntity);

    await expect(
      rows.save(
        rows.create({
          userId: owner,
          code: 'MINE',
          name: 'Mine',
          kind: TransactionCategoryKind.EXPENSE,
        }),
      ),
    ).rejects.toBeInstanceOf(QueryFailedError);
  });

  it('seeds the catalog idempotently', async () => {
    await new GlobalTransactionCategoriesSeeder().run(dataSource.manager);

    await expect(
      dataSource.getRepository(TransactionCategoryOrmEntity).count(),
    ).resolves.toBe(16);
  });
});
