import { EntityManager } from 'typeorm';

export interface Seeder {
  readonly name: string;
  run(manager: EntityManager): Promise<void>;
}
