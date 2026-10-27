import type { AbilityPair } from '@shared/domain/authorization/ability-pair.type';
import { AbilityEntity } from '../entities/ability.entity';

export const ABILITY_REPOSITORY = Symbol('ABILITY_REPOSITORY');

export interface AbilityRepository {
  findAll(): Promise<AbilityEntity[]>;
  findByPairs(pairs: AbilityPair[]): Promise<AbilityEntity[]>;
}
