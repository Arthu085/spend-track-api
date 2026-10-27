import type { AbilityPair } from '../authorization/ability-pair.type';
import { ForbiddenError } from './forbidden.error';

export class MissingAbilityError extends ForbiddenError {
  constructor(readonly requiredAbilities: readonly AbilityPair[]) {
    super('authorization.errors.missing_ability');
  }
}
