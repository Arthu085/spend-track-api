import { InactiveRecordError } from '@shared/domain/errors';

export class InactiveAbilityError extends InactiveRecordError {
  constructor() {
    super('authorization.errors.ability_inactive');
  }
}
