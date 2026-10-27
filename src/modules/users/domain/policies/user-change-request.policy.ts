import { UserChangeRequestEntity } from '../entities/user-change-request.entity';
import { UserEntity } from '../entities/user.entity';
import { UserChangeRequestNotFoundError } from '../errors/user-change-request-not-found.error';
import { UserChangeRequestNotPendingError } from '../errors/user-change-request-not-pending.error';
import { UserChangeRequestRecipientForbiddenError } from '../errors/user-change-request-recipient-forbidden.error';
import { hasAdminRole } from './admin-safety.policy';

export function assertMayReceiveChangeRequests(user: UserEntity): void {
  if (!hasAdminRole(user)) {
    throw new UserChangeRequestRecipientForbiddenError();
  }
}

export function assertChangeRequestPendingFor(
  request: UserChangeRequestEntity | null,
  targetUserId: number,
  now: Date,
): asserts request is UserChangeRequestEntity {
  if (!request || request.targetUserId !== targetUserId) {
    throw new UserChangeRequestNotFoundError();
  }

  if (!request.isPending(now)) {
    throw new UserChangeRequestNotPendingError();
  }
}
