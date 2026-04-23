import { DataSource } from 'typeorm';
import { ISeed } from '../interfaces/seed.interface';
import { RoleOrmEntity } from 'src/modules/access-control/infra/entities/role.orm.entity';
import { AbilityOrmEntity } from 'src/modules/access-control/infra/entities/ability.orm.entity';
import { RoleAbilityOrmEntity } from 'src/modules/access-control/infra/entities/role-ability.orm.entity';
import { RoleEnum } from 'src/modules/access-control/domain/enums/role.enum';

export class RoleAbilitySeed implements ISeed {
  name = 'RoleAbilitySeed';

  constructor(private readonly dataSource: DataSource) {}

  async run(): Promise<void> {
    const roleRepo = this.dataSource.getRepository(RoleOrmEntity);
    const abilityRepo = this.dataSource.getRepository(AbilityOrmEntity);
    const roleAbilityRepo = this.dataSource.getRepository(RoleAbilityOrmEntity);

    const admin = await roleRepo.findOneBy({ name: RoleEnum.ADMIN });

    if (!admin) {
      throw new Error('Role ADMIN não encontrada');
    }

    const abilities = await abilityRepo.find();

    const roleAbilities = abilities.map((ability) => ({
      role: admin,
      ability: ability,
    }));

    await roleAbilityRepo.upsert(roleAbilities, {
      conflictPaths: ['role', 'ability'],
      skipUpdateIfNoValuesChanged: true,
    });
  }
}
