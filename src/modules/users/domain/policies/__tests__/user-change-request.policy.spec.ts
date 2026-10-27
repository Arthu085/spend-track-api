import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import type { RoleEntity } from '@modules/authorization/domain/entities/role.entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildUser } from '@test/support/builders/user.builder';
import { buildUserChangeRequest } from '@test/support/builders/user-change-request.builder';
import { UserChangeRequestStatus } from '../../enums/user-change-request-status.enum';
import { UserChangeRequestNotFoundError } from '../../errors/user-change-request-not-found.error';
import { UserChangeRequestNotPendingError } from '../../errors/user-change-request-not-pending.error';
import { UserChangeRequestRecipientForbiddenError } from '../../errors/user-change-request-recipient-forbidden.error';
import {
  assertChangeRequestPendingFor,
  assertMayReceiveChangeRequests,
} from '../user-change-request.policy';

function role(name: RoleEnum, status = RecordStatus.ACTIVE): RoleEntity {
  return { uuid: `${name}-role`, name, status, deletedAt: null } as RoleEntity;
}

describe('assertMayReceiveChangeRequests', () => {
  it('accepts a user holding ADMIN, whatever the role status', () => {
    expect(() =>
      assertMayReceiveChangeRequests(
        buildUser({ roles: [role(RoleEnum.ADMIN, RecordStatus.INACTIVE)] }),
      ),
    ).not.toThrow();
  });

  it('refuses a user without ADMIN', () => {
    expect(() =>
      assertMayReceiveChangeRequests(
        buildUser({ roles: [role(RoleEnum.USER)] }),
      ),
    ).toThrow(UserChangeRequestRecipientForbiddenError);
  });
});

describe('assertChangeRequestPendingFor', () => {
  const now = new Date();

  it('accepts a pending request addressed to the user', () => {
    const request = buildUserChangeRequest({ targetUserId: 7 });

    expect(() => assertChangeRequestPendingFor(request, 7, now)).not.toThrow();
  });

  it("hides a missing request or another user's request behind the same 404", () => {
    expect(() => assertChangeRequestPendingFor(null, 7, now)).toThrow(
      UserChangeRequestNotFoundError,
    );
    expect(() =>
      assertChangeRequestPendingFor(
        buildUserChangeRequest({ targetUserId: 8 }),
        7,
        now,
      ),
    ).toThrow(UserChangeRequestNotFoundError);
  });

  it.each([
    {
      status: UserChangeRequestStatus.APPROVED,
      expiresAt: new Date(now.getTime() + 1000),
    },
    {
      status: UserChangeRequestStatus.PENDING,
      expiresAt: new Date(now.getTime() - 1),
    },
  ])(
    'rejects a request that is $status or expired',
    ({ status, expiresAt }) => {
      const request = buildUserChangeRequest({
        targetUserId: 7,
        status,
        expiresAt,
      });

      expect(() => assertChangeRequestPendingFor(request, 7, now)).toThrow(
        UserChangeRequestNotPendingError,
      );
    },
  );
});
