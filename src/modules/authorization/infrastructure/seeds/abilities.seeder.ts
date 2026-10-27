import { EntityManager } from 'typeorm';
import { Seeder } from '@core/database/seeds/seeder.interface';
import { ABILITY_CATALOG } from '../../domain/catalog/ability-catalog';
import { AbilityOrmEntity } from '../persistence/entities/ability.orm-entity';

export class AbilitiesSeeder implements Seeder {
  readonly name = 'abilities-seeder';

  async run(manager: EntityManager): Promise<void> {
    const repository = manager.getRepository(AbilityOrmEntity);

    for (const definition of ABILITY_CATALOG) {
      const existing = await repository.findOne({
        where: { action: definition.action, subject: definition.subject },
      });

      if (existing) {
        continue;
      }

      const ability = repository.create({
        action: definition.action,
        subject: definition.subject,
      });

      await repository.save(ability);
    }
  }
}
