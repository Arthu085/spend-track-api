import { EntityManager } from 'typeorm';
import { Seeder } from '@core/database/seeds/seeder.interface';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { ROLE_ABILITY_GRANTS } from '../../domain/catalog/ability-catalog';
import { RoleEnum } from '../../domain/enums/role.enum';
import { AbilityOrmEntity } from '../persistence/entities/ability.orm-entity';
import { RoleOrmEntity } from '../persistence/entities/role.orm-entity';

export class RolesSeeder implements Seeder {
  readonly name = 'roles-seeder';

  async run(manager: EntityManager): Promise<void> {
    const roleRepository = manager.getRepository(RoleOrmEntity);
    const abilityRepository = manager.getRepository(AbilityOrmEntity);

    for (const roleName of Object.values(RoleEnum)) {
      const existing = await roleRepository.findOne({
        where: { name: roleName },
      });

      if (existing) {
        continue;
      }

      const grants = ROLE_ABILITY_GRANTS[roleName];

      const defaultAbilities =
        grants.length > 0
          ? await abilityRepository.find({
              where: grants.map((grant) => ({
                action: grant.action,
                subject: grant.subject,
              })),
            })
          : [];

      if (defaultAbilities.length !== grants.length) {
        throw new Error(
          `Cannot seed role "${roleName}": ${grants.length - defaultAbilities.length} of its default abilities are missing`,
        );
      }

      const role = roleRepository.create({
        name: roleName,
        abilities: defaultAbilities.filter(
          (ability) => ability.status === RecordStatus.ACTIVE,
        ),
      });

      await roleRepository.save(role);
    }
  }
}
