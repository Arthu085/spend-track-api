import { AbilityEntity } from '../entities/ability.entity';

export interface IRoleAbilityRepository {
  replaceRoleAbilities(roleId: number, abilityIds: number[]): Promise<void>;
}
