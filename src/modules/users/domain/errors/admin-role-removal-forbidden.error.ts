import { ForbiddenError } from '@shared/domain/errors';

export class AdminRoleRemovalForbiddenError extends ForbiddenError {
  constructor() {
    super('users.errors.admin_role_removal_forbidden');
  }
}
