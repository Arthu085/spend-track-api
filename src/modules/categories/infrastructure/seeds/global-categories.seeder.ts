import { EntityManager } from 'typeorm';
import { Seeder } from '@core/database/seeds/seeder.interface';
import { GLOBAL_CATEGORIES } from '../../domain/catalog/global-categories';
import { CategoryOrmEntity } from '../persistence/entities/category.orm-entity';

export class GlobalCategoriesSeeder implements Seeder {
  readonly name = 'global-categories-seeder';

  async run(manager: EntityManager): Promise<void> {
    const repository = manager.getRepository(CategoryOrmEntity);

    for (const definition of GLOBAL_CATEGORIES) {
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
