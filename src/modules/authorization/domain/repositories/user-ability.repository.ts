import type { AbilityPair } from '@shared/domain/authorization/ability-pair.type';

export const USER_ABILITY_REPOSITORY = Symbol('USER_ABILITY_REPOSITORY');

export interface UserAbilityRepository {
  findGrantedAbilities(userUuid: string): Promise<AbilityPair[]>;
}
