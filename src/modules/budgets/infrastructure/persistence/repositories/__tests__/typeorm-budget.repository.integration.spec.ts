import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { TransactionCategoryEntity } from '@modules/transaction-categories/domain/entities/transaction-category.entity';
import { TransactionCategoryKind } from '@modules/transaction-categories/domain/enums/transaction-category-kind.enum';
import { TransactionCategoryOrmEntity } from '@modules/transaction-categories/infrastructure/persistence/entities/transaction-category.orm-entity';
import { TypeOrmTransactionCategoryRepository } from '@modules/transaction-categories/infrastructure/persistence/repositories/typeorm-transaction-category.repository';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { BudgetCategoryLimitOrmEntity } from '../../entities/budget-category-limit.orm-entity';
import { BudgetOrmEntity } from '../../entities/budget.orm-entity';
import { TypeOrmBudgetRepository } from '../typeorm-budget.repository';

describe('TypeOrmBudgetRepository (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let repository: TypeOrmBudgetRepository;
  let categories: TypeOrmTransactionCategoryRepository;
  let transactionManager: TransactionManagerPort;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([
          BudgetOrmEntity,
          BudgetCategoryLimitOrmEntity,
          TransactionCategoryOrmEntity,
          UserOrmEntity,
        ]),
      ],
      providers: [
        TypeOrmBudgetRepository,
        TypeOrmTransactionCategoryRepository,
      ],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    repository = moduleRef.get(TypeOrmBudgetRepository);
    categories = moduleRef.get(TypeOrmTransactionCategoryRepository);
    transactionManager = moduleRef.get(TRANSACTION_MANAGER);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "budget_category_limits", "budgets", "users" RESTART IDENTITY CASCADE',
    );
    await dataSource.query(
      'DELETE FROM "transaction_categories" WHERE "user_id" IS NOT NULL',
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

  async function insertCategory(
    ownerId: number,
    name: string,
  ): Promise<TransactionCategoryEntity> {
    return categories.create(
      TransactionCategoryEntity.createPersonal({
        uuid: randomUUID(),
        ownerId,
        kind: TransactionCategoryKind.EXPENSE,
        name,
        color: null,
      }),
    );
  }

  it('returns null for a month without a budget', async () => {
    const ownerId = await insertUser();

    await expect(
      repository.findByMonth(ownerId, '2026-11-01'),
    ).resolves.toBeNull();
  });

  it('saves exact limits and replaces them on the same row', async () => {
    const ownerId = await insertUser();
    const groceries = await insertCategory(ownerId, 'Groceries');
    const travel = await insertCategory(ownerId, 'Travel');

    await repository.save(ownerId, '2026-11-01', {
      totalLimit: 99999999999999,
      categoryLimits: [
        { category: groceries, limit: 80001 },
        { category: travel, limit: 1 },
      ],
    });

    const replaced = await transactionManager.runInTransaction(() =>
      repository.save(ownerId, '2026-11-01', {
        totalLimit: null,
        categoryLimits: [{ category: travel, limit: 20050 }],
      }),
    );

    expect(replaced).toMatchObject({ month: '2026-11-01', totalLimit: null });
    expect(
      replaced.categoryLimits.map(({ category, limit }) => [
        category.name,
        limit,
      ]),
    ).toEqual([['Travel', 20050]]);
    await expect(
      dataSource.getRepository(BudgetOrmEntity).count(),
    ).resolves.toBe(1);
    await expect(
      dataSource.getRepository(BudgetCategoryLimitOrmEntity).count(),
    ).resolves.toBe(1);
  });

  it('keeps soft-deleted categories on the budget that uses them', async () => {
    const ownerId = await insertUser();
    const groceries = await insertCategory(ownerId, 'Groceries');

    await repository.save(ownerId, '2026-11-01', {
      totalLimit: 1000,
      categoryLimits: [{ category: groceries, limit: 500 }],
    });

    await categories.softDelete(groceries);

    const budget = await repository.findByMonth(ownerId, '2026-11-01');

    expect(budget?.categoryLimits.map(({ category }) => category.uuid)).toEqual(
      [groceries.uuid],
    );
  });

  it('keeps each user and each month separate', async () => {
    const owner = await insertUser();
    const other = await insertUser();

    await repository.save(owner, '2026-11-01', {
      totalLimit: 1000,
      categoryLimits: [],
    });

    await repository.save(owner, '2026-12-01', {
      totalLimit: 2000,
      categoryLimits: [],
    });

    await expect(
      repository.findByMonth(other, '2026-11-01'),
    ).resolves.toBeNull();
    await expect(repository.delete(other, '2026-11-01')).resolves.toBe(false);
    await expect(repository.delete(owner, '2026-11-01')).resolves.toBe(true);
    await expect(
      repository.findByMonth(owner, '2026-11-01'),
    ).resolves.toBeNull();
    await expect(
      repository.findByMonth(owner, '2026-12-01'),
    ).resolves.toMatchObject({ totalLimit: 2000 });
  });

  it('removes the category limits with their budget', async () => {
    const ownerId = await insertUser();
    const groceries = await insertCategory(ownerId, 'Groceries');

    await repository.save(ownerId, '2026-11-01', {
      totalLimit: null,
      categoryLimits: [{ category: groceries, limit: 500 }],
    });

    await repository.delete(ownerId, '2026-11-01');

    await expect(
      dataSource.getRepository(BudgetCategoryLimitOrmEntity).count(),
    ).resolves.toBe(0);
  });
});
