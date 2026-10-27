import { NotFoundError } from '@shared/domain/errors';

export class RoleNotFoundError extends NotFoundError {
  constructor() {
    super('authorization.errors.role_not_found');
  }
}
