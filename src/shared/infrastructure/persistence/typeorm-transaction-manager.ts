import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type { TransactionManagerPort } from '../../application/ports';
import {
  getTransactionalEntityManager,
  transactionalEntityManagerStorage,
} from './transactional-entity-manager.storage';

@Injectable()
export class TypeOrmTransactionManager implements TransactionManagerPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.ambientManager()) {
      return work();
    }

    return this.dataSource.transaction((manager) =>
      transactionalEntityManagerStorage.run(manager, work),
    );
  }

  async runInSavepoint<T>(work: () => Promise<T>): Promise<T> {
    const ambient = this.ambientManager();

    if (!ambient) {
      return this.runInTransaction(work);
    }

    return ambient.transaction((manager) =>
      transactionalEntityManagerStorage.run(manager, work),
    );
  }

  private ambientManager(): EntityManager | undefined {
    const manager = getTransactionalEntityManager();

    return manager?.dataSource === this.dataSource ? manager : undefined;
  }
}
