import { ConflictError } from '@shared/domain/errors';

export class LastActiveAdminError extends ConflictError {
  constructor() {
    super('users.errors.last_active_admin');
  }
}
