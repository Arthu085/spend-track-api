import { ValidationError } from '@shared/domain/errors';

export class CurrentPasswordRequiredError extends ValidationError {
  constructor() {
    super('users.errors.current_password_required');
  }
}
