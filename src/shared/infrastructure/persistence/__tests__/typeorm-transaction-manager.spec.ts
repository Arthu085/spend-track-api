import type { DataSource, EntityManager } from 'typeorm';
import { TypeOrmTransactionManager } from '../typeorm-transaction-manager';
import {
  getTransactionalEntityManager,
  transactionalEntityManagerStorage,
} from '../transactional-entity-manager.storage';

// The fake manager carries a back-reference to its own DataSource because
// runInTransaction only joins an active transaction belonging to the SAME
// DataSource — the same guard BaseTransactionalRepository applies.
function buildFakeDataSource(): {
  dataSource: DataSource;
  transactionalManager: EntityManager;
  transactionSpy: jest.Mock;
} {
  const managerRef: { dataSource?: DataSource } = {};

  const transactionSpy = jest
    .fn()
    .mockImplementation(
      async (work: (manager: EntityManager) => Promise<unknown>) =>
        work(managerRef as unknown as EntityManager),
    );

  const dataSource = { transaction: transactionSpy } as unknown as DataSource;

  managerRef.dataSource = dataSource;

  return {
    dataSource,
    transactionalManager: managerRef as unknown as EntityManager,
    transactionSpy,
  };
}

describe('TypeOrmTransactionManager', () => {
  it('opens a DataSource transaction and exposes the transactional manager via ALS only for the duration of the work', async () => {
    const { dataSource, transactionalManager, transactionSpy } =
      buildFakeDataSource();

    const manager = new TypeOrmTransactionManager(dataSource);

    expect(getTransactionalEntityManager()).toBeUndefined();

    let observedDuringWork: EntityManager | undefined;

    await manager.runInTransaction(() => {
      observedDuringWork = getTransactionalEntityManager();

      return Promise.resolve();
    });

    expect(transactionSpy).toHaveBeenCalledTimes(1);
    expect(observedDuringWork).toBe(transactionalManager);
    expect(getTransactionalEntityManager()).toBeUndefined();
  });

  it('returns the value produced by the work function', async () => {
    const { dataSource } = buildFakeDataSource();
    const manager = new TypeOrmTransactionManager(dataSource);

    await expect(
      manager.runInTransaction(() => Promise.resolve('the-result')),
    ).resolves.toBe('the-result');
  });

  it('propagates a rejection from the work function', async () => {
    const { dataSource } = buildFakeDataSource();
    const manager = new TypeOrmTransactionManager(dataSource);

    await expect(
      manager.runInTransaction(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('joins an already-active transaction on the same DataSource instead of opening a nested one', async () => {
    const { dataSource, transactionalManager, transactionSpy } =
      buildFakeDataSource();

    const manager = new TypeOrmTransactionManager(dataSource);

    let observedInsideNested: EntityManager | undefined;

    await transactionalEntityManagerStorage.run(
      transactionalManager,
      async () => {
        await manager.runInTransaction(() => {
          observedInsideNested = getTransactionalEntityManager();

          return Promise.resolve();
        });
      },
    );

    expect(transactionSpy).not.toHaveBeenCalled();
    expect(observedInsideNested).toBe(transactionalManager);
  });

  // A manager from an unrelated DataSource must NOT be treated as joinable:
  // BaseTransactionalRepository would fall back to its default manager for this
  // DataSource, so joining would leave every write outside any transaction.
  it('opens its own transaction when the active manager belongs to a different DataSource', async () => {
    const foreign = buildFakeDataSource();

    const { dataSource, transactionalManager, transactionSpy } =
      buildFakeDataSource();

    const manager = new TypeOrmTransactionManager(dataSource);

    let observedInsideNested: EntityManager | undefined;

    await transactionalEntityManagerStorage.run(
      foreign.transactionalManager,
      async () => {
        await manager.runInTransaction(() => {
          observedInsideNested = getTransactionalEntityManager();

          return Promise.resolve();
        });
      },
    );

    expect(transactionSpy).toHaveBeenCalledTimes(1);
    expect(foreign.transactionSpy).not.toHaveBeenCalled();
    expect(observedInsideNested).toBe(transactionalManager);
  });

  describe('runInSavepoint', () => {
    it('opens its own DataSource transaction when no transaction is active', async () => {
      const { dataSource, transactionalManager, transactionSpy } =
        buildFakeDataSource();

      const manager = new TypeOrmTransactionManager(dataSource);

      let observed: EntityManager | undefined;

      await expect(
        manager.runInSavepoint(() => {
          observed = getTransactionalEntityManager();

          return Promise.resolve('done');
        }),
      ).resolves.toBe('done');

      expect(transactionSpy).toHaveBeenCalledTimes(1);
      expect(observed).toBe(transactionalManager);
    });

    it('nests through the active manager (a savepoint) when a transaction on the same DataSource is active', async () => {
      const { dataSource, transactionalManager, transactionSpy } =
        buildFakeDataSource();

      const savepointManager = { dataSource } as unknown as EntityManager;

      const savepointSpy = jest
        .fn()
        .mockImplementation(
          async (work: (manager: EntityManager) => Promise<unknown>) =>
            work(savepointManager),
        );

      Object.assign(transactionalManager, { transaction: savepointSpy });

      const manager = new TypeOrmTransactionManager(dataSource);

      let observed: EntityManager | undefined;

      await transactionalEntityManagerStorage.run(
        transactionalManager,
        async () => {
          await manager.runInSavepoint(() => {
            observed = getTransactionalEntityManager();

            return Promise.resolve();
          });
        },
      );

      expect(transactionSpy).not.toHaveBeenCalled();
      expect(savepointSpy).toHaveBeenCalledTimes(1);
      expect(observed).toBe(savepointManager);
    });

    it('opens its own transaction when the active manager belongs to a different DataSource', async () => {
      const foreign = buildFakeDataSource();
      const foreignSavepoint = jest.fn();

      Object.assign(foreign.transactionalManager, {
        transaction: foreignSavepoint,
      });

      const { dataSource, transactionSpy } = buildFakeDataSource();
      const manager = new TypeOrmTransactionManager(dataSource);

      await transactionalEntityManagerStorage.run(
        foreign.transactionalManager,
        () => manager.runInSavepoint(() => Promise.resolve()),
      );

      expect(transactionSpy).toHaveBeenCalledTimes(1);
      expect(foreignSavepoint).not.toHaveBeenCalled();
    });
  });
});
