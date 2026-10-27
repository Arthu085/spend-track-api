import type { ObjectLiteral, Repository } from 'typeorm';
import { getTransactionalEntityManager } from './transactional-entity-manager.storage';

export abstract class BaseTransactionalRepository<
  Entity extends ObjectLiteral,
> {
  protected constructor(
    private readonly defaultRepository: Repository<Entity>,
  ) {}

  protected get repository(): Repository<Entity> {
    const manager = getTransactionalEntityManager();

    if (!manager) {
      return this.defaultRepository;
    }

    if (manager.dataSource !== this.defaultRepository.manager.dataSource) {
      return this.defaultRepository;
    }

    return manager.getRepository(this.defaultRepository.target);
  }
}
