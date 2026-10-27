import type { DataSource, EntityManager } from 'typeorm';
import { runSeeders } from '../run-seeders';
import { Seeder } from '../seeder.interface';

describe('runSeeders', () => {
  const manager = {} as EntityManager;

  function buildDataSource() {
    const transaction = jest.fn(
      (work: (transactionManager: EntityManager) => Promise<void>) =>
        work(manager),
    );

    return {
      dataSource: { transaction } as unknown as DataSource,
      transaction,
    };
  }

  function buildSeeder(name: string, run: Seeder['run']): Seeder {
    return { name, run: jest.fn(run) };
  }

  it('runs every seeder in order with the same transactional manager', async () => {
    const { dataSource, transaction } = buildDataSource();
    const calls: string[] = [];

    const seeders = ['first', 'second'].map((name) =>
      buildSeeder(name, (received) => {
        expect(received).toBe(manager);
        calls.push(name);
        return Promise.resolve();
      }),
    );

    await runSeeders(dataSource, seeders);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['first', 'second']);
  });

  it('stops at the failing seeder and rethrows with its name and cause', async () => {
    const { dataSource } = buildDataSource();
    const cause = new Error('boom');
    const failing = buildSeeder('failing-seeder', () => Promise.reject(cause));
    const nextRun = jest.fn(() => Promise.resolve());
    const next: Seeder = { name: 'next-seeder', run: nextRun };

    const error: unknown = await runSeeders(dataSource, [failing, next]).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Seeder "failing-seeder" failed');
    expect((error as Error).cause).toBe(cause);
    expect(nextRun).not.toHaveBeenCalled();
  });
});
