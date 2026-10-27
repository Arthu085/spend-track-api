import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import type { RoleEntity } from '@modules/authorization/domain/entities/role.entity';
import { buildUser } from '@test/support/builders/user.builder';
import { buildUserChangeRequest } from '@test/support/builders/user-change-request.builder';
import { UserChangeRequestStatus } from '../../enums/user-change-request-status.enum';
import { UserChangeRequestEntity } from '../user-change-request.entity';

function role(uuid: string, name: RoleEnum): RoleEntity {
  return { uuid, name } as RoleEntity;
}

describe('UserChangeRequestEntity', () => {
  const admin = role('admin-role', RoleEnum.ADMIN);
  const member = role('user-role', RoleEnum.USER);

  it('opens as PENDING with no decision', () => {
    const request = UserChangeRequestEntity.open({
      uuid: 'request-1',
      targetUserId: 1,
      requestedBy: 2,
      current: { name: 'Jane', email: 'jane@example.com', roles: [admin] },
      requested: { name: 'Janet', email: 'jane@example.com', roles: [admin] },
      expiresAt: new Date(Date.now() + 1000),
    });

    expect(request.status).toBe(UserChangeRequestStatus.PENDING);
    expect(request.decidedAt).toBeNull();
    expect(request.requesterName).toBeNull();
  });

  it('is pending only while PENDING and before expiry', () => {
    const now = new Date();
    const later = new Date(now.getTime() + 1000);

    expect(buildUserChangeRequest({ expiresAt: later }).isPending(now)).toBe(
      true,
    );
    expect(buildUserChangeRequest({ expiresAt: now }).isPending(now)).toBe(
      false,
    );
    expect(
      buildUserChangeRequest({
        expiresAt: later,
        status: UserChangeRequestStatus.SUPERSEDED,
      }).isPending(now),
    ).toBe(false);
  });

  it('matches the current profile by name, email and role set, ignoring role order', () => {
    const request = buildUserChangeRequest({
      current: {
        name: 'Jane',
        email: 'jane@example.com',
        roles: [admin, member],
      },
    });

    const user = buildUser({
      name: 'Jane',
      email: 'jane@example.com',
      roles: [member, admin],
    });

    expect(request.matchesCurrentProfileOf(user)).toBe(true);
    expect(
      request.matchesCurrentProfileOf(buildUser({ ...user, name: 'Other' })),
    ).toBe(false);
    expect(
      request.matchesCurrentProfileOf(
        buildUser({ name: 'Jane', email: 'jane@example.com', roles: [admin] }),
      ),
    ).toBe(false);
  });

  it.each([
    ['approve', UserChangeRequestStatus.APPROVED],
    ['reject', UserChangeRequestStatus.REJECTED],
  ] as const)(
    '%s records the decision without mutating the original',
    (method, status) => {
      const request = buildUserChangeRequest();

      const decided = request[method]();

      expect(decided.status).toBe(status);
      expect(decided.decidedAt).toBeInstanceOf(Date);
      expect(decided.requested).toBe(request.requested);
      expect(request.status).toBe(UserChangeRequestStatus.PENDING);
    },
  );
});
