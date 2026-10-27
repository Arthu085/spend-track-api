import { ForbiddenError } from '@shared/domain/errors';

export class SelfDeletionForbiddenError extends ForbiddenError {
  constructor() {
    super('users.errors.self_deletion_forbidden');
  }
}
