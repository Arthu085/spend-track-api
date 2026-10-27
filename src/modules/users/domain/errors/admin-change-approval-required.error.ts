import { ConflictError } from '@shared/domain/errors';

export class AdminChangeApprovalRequiredError extends ConflictError {
  constructor() {
    super('users.errors.admin_change_approval_required');
  }
}
