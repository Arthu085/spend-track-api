import type {
  DataSource,
  EntityManager,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { BaseTransactionalRepository } from '../base.transactional-repository';
import { transactionalEntityManagerStorage } from '../transactional-entity-manager.storage';

interface FakeEntity extends ObjectLiteral {
  id: number;
}

class TestTransactionalRepository extends BaseTransactionalRepository<FakeEntity> {
  constructor(defaultRepository: Repository<FakeEntity>) {
    super(defaultRepository);
  }

  get exposedRepository(): Repository<FakeEntity> {
    return this.repository;
  }
}

function buildFakeRepository(
  dataSource: DataSource,
  target: unknown = 'FakeEntity',
): Repository<FakeEntity> {
  return {
    target,
    manager: { dataSource },
  } as unknown as Repository<FakeEntity>;
}

describe('BaseTransactionalRepository', () => {
  it('returns the injected repository unchanged when there is no active transaction context', () => {
    const dataSource = {} as unknown as DataSource;
    const defaultRepository = buildFakeRepository(dataSource);
    const repository = new TestTransactionalRepository(defaultRepository);

    // No transactionalEntityManagerStorage.run(...) wraps this assertion, so
    // getStore() is undefined and defaultRepository.manager is never touched.
    expect(repository.exposedRepository).toBe(defaultRepository);
  });

  it('returns a manager-scoped repository when the active manager shares the default repository dataSource', () => {
    const dataSource = {} as unknown as DataSource;
    const defaultRepository = buildFakeRepository(dataSource, 'FakeEntity');
    const repository = new TestTransactionalRepository(defaultRepository);

    const scopedRepository = {} as unknown as Repository<FakeEntity>;
    const getRepository = jest.fn().mockReturnValue(scopedRepository);

    const manager = {
      dataSource,
      getRepository,
    } as unknown as EntityManager;

    transactionalEntityManagerStorage.run(manager, () => {
      expect(repository.exposedRepository).toBe(scopedRepository);
    });

    expect(getRepository).toHaveBeenCalledWith('FakeEntity');
  });

  it('falls back to the injected repository when the active manager belongs to a different dataSource', () => {
    const dataSource = {} as unknown as DataSource;
    const otherDataSource = {} as unknown as DataSource;
    const defaultRepository = buildFakeRepository(dataSource);
    const repository = new TestTransactionalRepository(defaultRepository);

    const getRepository = jest.fn();

    const manager = {
      dataSource: otherDataSource,
      getRepository,
    } as unknown as EntityManager;

    transactionalEntityManagerStorage.run(manager, () => {
      expect(repository.exposedRepository).toBe(defaultRepository);
    });

    expect(getRepository).not.toHaveBeenCalled();
  });
});
