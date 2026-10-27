import { ForbiddenError } from '@shared/domain/errors';

export class SelfDeactivationForbiddenError extends ForbiddenError {
  constructor() {
    super('users.errors.self_deactivation_forbidden');
  }
}
