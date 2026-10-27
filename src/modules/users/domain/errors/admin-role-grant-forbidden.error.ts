import { ForbiddenError } from '@shared/domain/errors';

export class AdminRoleGrantForbiddenError extends ForbiddenError {
  constructor() {
    super('users.errors.admin_role_grant_forbidden');
  }
}
