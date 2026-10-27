import { ForbiddenError } from '@shared/domain/errors';

export class AdminTargetForbiddenError extends ForbiddenError {
  constructor() {
    super('users.errors.admin_target_forbidden');
  }
}
