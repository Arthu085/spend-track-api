import { EntityManager } from 'typeorm';
import { Seeder } from '@core/database/seeds/seeder.interface';
import { GLOBAL_TRANSACTION_CATEGORIES } from '../../domain/catalog/global-transaction-categories';
import { TransactionCategoryOrmEntity } from '../persistence/entities/transaction-category.orm-entity';

export class GlobalTransactionCategoriesSeeder implements Seeder {
  readonly name = 'global-transaction-categories-seeder';

  async run(manager: EntityManager): Promise<void> {
    const repository = manager.getRepository(TransactionCategoryOrmEntity);

    for (const definition of GLOBAL_TRANSACTION_CATEGORIES) {
      const existing = await repository.findOne({
        where: { code: definition.code },
        withDeleted: true,
      });

      if (existing) {
        continue;
      }

      await repository.save(
        repository.create({
          userId: null,
          code: definition.code,
          name: definition.name,
          kind: definition.kind,
          color: definition.color,
        }),
      );
    }
  }
}
