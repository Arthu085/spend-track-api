import type { AbilityPair } from '../../authorization/ability-pair.type';
import { Subject } from '../../authorization/subject';
import { Action } from '../../enums/action.enum';
import { DomainError } from '../domain-error';
import { ForbiddenError } from '../forbidden.error';
import { MissingAbilityError } from '../missing-ability.error';

describe('MissingAbilityError', () => {
  const requiredAbilities: AbilityPair[] = [
    { action: Action.UPDATE, subject: Subject.USER },
  ];

  it('is both a ForbiddenError and a DomainError', () => {
    const error = new MissingAbilityError(requiredAbilities);

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
  });

  it('carries the documented message key', () => {
    const error = new MissingAbilityError(requiredAbilities);

    expect(error.messageKey).toBe('authorization.errors.missing_ability');
  });

  it('exposes exactly the abilities passed to the constructor', () => {
    const error = new MissingAbilityError(requiredAbilities);

    expect(error.requiredAbilities).toBe(requiredAbilities);
    expect(error.requiredAbilities).toEqual(requiredAbilities);
  });

  it('carries its own class name', () => {
    const error = new MissingAbilityError(requiredAbilities);

    expect(error.name).toBe('MissingAbilityError');
  });

  it('supports an empty required-abilities list', () => {
    const error = new MissingAbilityError([]);

    expect(error.requiredAbilities).toEqual([]);
  });
});
