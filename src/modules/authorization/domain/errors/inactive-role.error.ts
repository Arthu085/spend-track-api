import { InactiveRecordError } from '@shared/domain/errors';

export class InactiveRoleError extends InactiveRecordError {
  constructor() {
    super('authorization.errors.role_inactive');
  }
}
