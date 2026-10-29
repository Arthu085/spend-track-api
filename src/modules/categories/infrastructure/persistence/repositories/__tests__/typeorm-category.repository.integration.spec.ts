import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { CategoryEntity } from '../../../../domain/entities/category.entity';
import { CategoryKind } from '../../../../domain/enums/category-kind.enum';
import { CategoryScope } from '../../../../domain/enums/category-scope.enum';
import { GlobalCategoriesSeeder } from '../../../seeds/global-categories.seeder';
import { CategoryOrmEntity } from '../../entities/category.orm-entity';
import { TypeOrmCategoryRepository } from '../typeorm-category.repository';

describe('TypeOrmCategoryRepository (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let repository: TypeOrmCategoryRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([CategoryOrmEntity, UserOrmEntity]),
      ],
      providers: [TypeOrmCategoryRepository],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    repository = moduleRef.get(TypeOrmCategoryRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await new GlobalCategoriesSeeder().run(dataSource.manager);
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "categories", "users" RESTART IDENTITY CASCADE',
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

  function personal(ownerId: number, name: string): CategoryEntity {
    return CategoryEntity.createPersonal({
      uuid: randomUUID(),
      ownerId,
      kind: CategoryKind.EXPENSE,
      name,
      color: null,
    });
  }

  it('shows the global catalog plus only the caller own categories', async () => {
    const owner = await insertUser();
    const stranger = await insertUser();
    const mine = await repository.create(personal(owner, 'Pets'));
    const theirs = await repository.create(personal(stranger, 'Secret'));

    const visible = await repository.findAllVisibleTo(owner);
    const uuids = visible.map((category) => category.uuid);

    expect(uuids).toContain(mine.uuid);
    expect(uuids).not.toContain(theirs.uuid);
    expect(
      visible.filter((category) => category.scope === CategoryScope.GLOBAL),
    ).toHaveLength(16);
    await expect(
      repository.findVisibleByUuid(theirs.uuid, owner),
    ).resolves.toBeNull();
  });

  it('finds a global category for every user', async () => {
    const owner = await insertUser();

    const [food] = await dataSource
      .getRepository(CategoryOrmEntity)
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

    const personalActive = await repository.findAllVisibleTo(owner, {
      scope: CategoryScope.PERSONAL,
      status: RecordStatus.ACTIVE,
    });

    const income = await repository.findAllVisibleTo(owner, {
      kind: CategoryKind.INCOME,
    });

    expect(personalActive.map((category) => category.name)).toEqual(['Pets']);
    expect(
      income.every((category) => category.kind === CategoryKind.INCOME),
    ).toBe(true);
  });

  it('rejects a personal category that carries a catalog code', async () => {
    const owner = await insertUser();
    const rows = dataSource.getRepository(CategoryOrmEntity);

    await expect(
      rows.save(
        rows.create({
          userId: owner,
          code: 'MINE',
          name: 'Mine',
          kind: CategoryKind.EXPENSE,
        }),
      ),
    ).rejects.toBeInstanceOf(QueryFailedError);
  });

  it('seeds the catalog idempotently', async () => {
    await new GlobalCategoriesSeeder().run(dataSource.manager);

    await expect(
      dataSource.getRepository(CategoryOrmEntity).count(),
    ).resolves.toBe(16);
  });
});
