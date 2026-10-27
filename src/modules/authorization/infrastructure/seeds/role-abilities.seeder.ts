import { EntityManager } from 'typeorm';
import { Seeder } from '@core/database/seeds/seeder.interface';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { ROLE_ABILITY_GRANTS } from '../../domain/catalog/ability-catalog';
import { RoleEnum } from '../../domain/enums/role.enum';
import { AbilityOrmEntity } from '../persistence/entities/ability.orm-entity';
import { RoleOrmEntity } from '../persistence/entities/role.orm-entity';

export class RoleAbilitiesSeeder implements Seeder {
  readonly name = 'role-abilities-seeder';

  async run(manager: EntityManager): Promise<void> {
    const admin = await manager.getRepository(RoleOrmEntity).findOne({
      where: { name: RoleEnum.ADMIN },
      relations: { abilities: true },
    });

    if (!admin) {
      throw new Error(
        `Cannot top up role "${RoleEnum.ADMIN}": the role does not exist`,
      );
    }

    const adminGrants = ROLE_ABILITY_GRANTS[RoleEnum.ADMIN];

    const catalogAbilities = await manager
      .getRepository(AbilityOrmEntity)
      .find({
        where: adminGrants.map((grant) => ({
          action: grant.action,
          subject: grant.subject,
        })),
      });

    if (catalogAbilities.length !== adminGrants.length) {
      throw new Error(
        `Cannot top up role "${RoleEnum.ADMIN}": ${adminGrants.length - catalogAbilities.length} catalog abilities are missing`,
      );
    }

    const grantedIds = new Set(admin.abilities.map((ability) => ability.id));

    const missingAbilities = catalogAbilities.filter(
      (ability) =>
        ability.status === RecordStatus.ACTIVE && !grantedIds.has(ability.id),
    );

    if (missingAbilities.length === 0) {
      return;
    }

    await manager
      .createQueryBuilder()
      .relation(RoleOrmEntity, 'abilities')
      .of(admin)
      .add(missingAbilities);
  }
}
