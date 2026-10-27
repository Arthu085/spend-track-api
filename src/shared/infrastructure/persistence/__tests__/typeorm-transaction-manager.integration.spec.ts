import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { TypeOrmUserRepository } from '@modules/users/infrastructure/persistence/repositories/typeorm-user.repository';
import { buildNewUser } from '@test/support/builders/user.builder';
import { getTransactionalEntityManager } from '../transactional-entity-manager.storage';

// Repositories write through the connection's default manager unless they are
// ALS-aware, so an adapter built only on DataSource.transaction() passes the
// unit specs yet fails every assertion below against real Postgres.
describe('TypeOrmTransactionManager (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let transactionManager: TransactionManagerPort;
  let userRepository: TypeOrmUserRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([UserOrmEntity]),
      ],
      providers: [TypeOrmUserRepository],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    transactionManager = moduleRef.get(TRANSACTION_MANAGER);
    userRepository = moduleRef.get(TypeOrmUserRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query('TRUNCATE TABLE "users" RESTART IDENTITY CASCADE');
  });

  async function countUsers(): Promise<number> {
    const rows: Array<{ count: string }> = await dataSource.query(
      'SELECT count(*) FROM "users"',
    );

    return Number(rows[0].count);
  }

  it('rolls back every write performed inside runInTransaction when the callback throws', async () => {
    await expect(
      transactionManager.runInTransaction(async () => {
        await userRepository.create(buildNewUser());
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    await expect(countUsers()).resolves.toBe(0);
  });

  it('commits every write performed inside runInTransaction when the callback resolves', async () => {
    await transactionManager.runInTransaction(async () => {
      await userRepository.create(buildNewUser());
    });

    await expect(countUsers()).resolves.toBe(1);
  });

  it('keeps an in-flight write invisible to a different pooled connection until the transaction commits', async () => {
    await transactionManager.runInTransaction(async () => {
      await userRepository.create(buildNewUser());

      // dataSource.query() runs on a different connection than the
      // transaction's dedicated QueryRunner, so it must not see the write yet.
      const rows: Array<{ count: string }> = await dataSource.query(
        'SELECT count(*) FROM "users"',
      );

      expect(Number(rows[0].count)).toBe(0);
    });

    await expect(countUsers()).resolves.toBe(1);
  });

  it('rolls back a nested runInTransaction call when the outer transaction throws', async () => {
    await expect(
      transactionManager.runInTransaction(async () => {
        await transactionManager.runInTransaction(async () => {
          await userRepository.create(buildNewUser());
        });

        throw new Error('outer boom');
      }),
    ).rejects.toThrow('outer boom');

    await expect(countUsers()).resolves.toBe(0);
  });

  it('never leaves the transactional context attached after the promise settles, on either path', async () => {
    expect(getTransactionalEntityManager()).toBeUndefined();

    await transactionManager.runInTransaction(async () => {
      await userRepository.create(buildNewUser());
    });

    expect(getTransactionalEntityManager()).toBeUndefined();

    await expect(
      transactionManager.runInTransaction(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(getTransactionalEntityManager()).toBeUndefined();
  });

  it('commits immediately when create is called outside any runInTransaction block', async () => {
    await userRepository.create(buildNewUser());

    await expect(countUsers()).resolves.toBe(1);
  });

  describe('runInSavepoint', () => {
    it('rolls back only the savepoint work after a failed statement and keeps the outer transaction usable', async () => {
      const duplicate = buildNewUser();

      await transactionManager.runInTransaction(async () => {
        await userRepository.create(duplicate);

        // A unique violation aborts the enclosing (sub)transaction in
        // Postgres; without a savepoint the outer COMMIT would fail too.
        await expect(
          transactionManager.runInSavepoint(async () => {
            await userRepository.create(buildNewUser());
            await userRepository.create(
              buildNewUser({ email: duplicate.email }),
            );
          }),
        ).rejects.toThrow();

        await userRepository.create(buildNewUser());
      });

      await expect(countUsers()).resolves.toBe(2);
    });

    it('commits the savepoint work together with the outer transaction', async () => {
      await transactionManager.runInTransaction(async () => {
        await transactionManager.runInSavepoint(async () => {
          await userRepository.create(buildNewUser());
        });
      });

      await expect(countUsers()).resolves.toBe(1);
    });

    it('rolls back released savepoint work when the outer transaction fails later', async () => {
      await expect(
        transactionManager.runInTransaction(async () => {
          await transactionManager.runInSavepoint(async () => {
            await userRepository.create(buildNewUser());
          });

          throw new Error('outer boom');
        }),
      ).rejects.toThrow('outer boom');

      await expect(countUsers()).resolves.toBe(0);
    });

    it('opens and commits its own transaction outside any runInTransaction block', async () => {
      await transactionManager.runInSavepoint(async () => {
        await userRepository.create(buildNewUser());
      });

      await expect(countUsers()).resolves.toBe(1);
      expect(getTransactionalEntityManager()).toBeUndefined();
    });
  });
});
