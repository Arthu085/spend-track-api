import {
  type ReconstituteUserChangeRequestInput,
  UserChangeRequestEntity,
} from '@modules/users/domain/entities/user-change-request.entity';
import { UserChangeRequestStatus } from '@modules/users/domain/enums/user-change-request-status.enum';

export function buildUserChangeRequest(
  overrides: Partial<ReconstituteUserChangeRequestInput> = {},
): UserChangeRequestEntity {
  return UserChangeRequestEntity.reconstitute({
    id: 1,
    uuid: 'change-request-uuid',
    createdAt: new Date(),
    targetUserId: 1,
    requestedBy: 2,
    requesterName: 'Requesting Admin',
    status: UserChangeRequestStatus.PENDING,
    current: { name: 'Jane Doe', email: 'jane@example.com', roles: [] },
    requested: { name: 'Jane Smith', email: 'jane@example.com', roles: [] },
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    decidedAt: null,
    ...overrides,
  });
}
