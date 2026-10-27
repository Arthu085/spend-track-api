import { ForbiddenError } from '@shared/domain/errors';

export class AdminRoleAbilitiesImmutableError extends ForbiddenError {
  constructor() {
    super('authorization.errors.admin_role_abilities_immutable');
  }
}
