import { ValidationError } from '@shared/domain/errors';

export class UnknownAbilityError extends ValidationError {
  constructor() {
    super('authorization.errors.unknown_ability');
  }
}
