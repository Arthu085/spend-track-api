import { AsyncLocalStorage } from 'node:async_hooks';
import type { EntityManager } from 'typeorm';

export const transactionalEntityManagerStorage =
  new AsyncLocalStorage<EntityManager>();

export function getTransactionalEntityManager(): EntityManager | undefined {
  return transactionalEntityManagerStorage.getStore();
}
