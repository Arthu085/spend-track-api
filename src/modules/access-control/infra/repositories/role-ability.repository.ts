import { DataSource, Repository } from 'typeorm';
import { IRoleAbilityRepository } from '../../domain/repositories/role-ability.repository.interface';
import { RoleAbilityOrmEntity } from '../entities/role-ability.orm.entity';
import { AbilityEntity } from '../../domain/entities/ability.entity';
import { AbilityMapper } from '../mappers/ability.mapper';

export class RoleAbilityRepository implements IRoleAbilityRepository {
  private repo: Repository<RoleAbilityOrmEntity>;

  constructor(private readonly dataSource: DataSource) {
    this.repo = this.dataSource.getRepository(RoleAbilityOrmEntity);
  }

  async findAbilitiesByRoleId(roleId: number): Promise<AbilityEntity[]> {
    const roleAbilities = await this.repo
      .createQueryBuilder('roleAbility')
      .leftJoinAndSelect('roleAbility.ability', 'ability')
      .where('roleAbility.role.id = :roleId', { roleId })
      .getMany();

    return roleAbilities.map((ra) => AbilityMapper.toDomain(ra.ability));
  }

  async replaceRoleAbilities(
    roleId: number,
    abilityIds: number[],
  ): Promise<void> {
    await this.repo.delete({
      role: { id: roleId },
    });

    if (!abilityIds.length) return;

    const inserts = abilityIds.map((abilityId) => ({
      role: { id: roleId },
      ability: { id: abilityId },
    }));

    await this.repo.insert(inserts);
  }
}
