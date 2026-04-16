import { AbilityEntity } from '../entities/ability.entity';

export interface IRoleAbilityRepository {
  findAbilitiesByRoleId(roleId: number): Promise<AbilityEntity[]>;

  replaceRoleAbilities(roleId: number, abilityIds: number[]): Promise<void>;
}
