export interface IRoleAbilityRepository {
  replaceRoleAbilities(roleId: number, abilityIds: number[]): Promise<void>;
}
