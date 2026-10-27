import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import type { UserEntity } from '../../entities/user.entity';
import { AdminRoleGrantForbiddenError } from '../../errors/admin-role-grant-forbidden.error';
import { AdminRoleRemovalForbiddenError } from '../../errors/admin-role-removal-forbidden.error';
import { AdminTargetForbiddenError } from '../../errors/admin-target-forbidden.error';
import { LastActiveAdminError } from '../../errors/last-active-admin.error';
import { SelfDeactivationForbiddenError } from '../../errors/self-deactivation-forbidden.error';
import { SelfDeletionForbiddenError } from '../../errors/self-deletion-forbidden.error';
import {
  assertActiveAdminRemains,
  assertAdminGrantAllowed,
  assertAdminRoleRetained,
  assertMayDeactivateSelf,
  assertMayDeleteSelf,
  assertMayManageAdmin,
  hasActiveAdminRole,
  hasAdminRole,
  requiresAdminChangeApproval,
} from '../admin-safety.policy';

function user(
  id: number,
  role: RoleEnum | null,
  status = RecordStatus.ACTIVE,
): UserEntity {
  return {
    id,
    status,
    deletedAt: null,
    roles:
      role === null
        ? []
        : [{ name: role, status: RecordStatus.ACTIVE, deletedAt: null }],
  } as UserEntity;
}

describe('admin safety policy', () => {
  it('allows only an active admin to grant ADMIN to a user who lacks it', () => {
    expect(() =>
      assertAdminGrantAllowed(user(1, RoleEnum.USER), null, [RoleEnum.ADMIN]),
    ).toThrow(AdminRoleGrantForbiddenError);
    expect(() => assertAdminGrantAllowed(null, null, [RoleEnum.ADMIN])).toThrow(
      AdminRoleGrantForbiddenError,
    );
    expect(() =>
      assertAdminGrantAllowed(
        user(1, RoleEnum.ADMIN, RecordStatus.INACTIVE),
        null,
        [RoleEnum.ADMIN],
      ),
    ).toThrow(AdminRoleGrantForbiddenError);
    expect(() =>
      assertAdminGrantAllowed(user(1, RoleEnum.ADMIN), null, [RoleEnum.ADMIN]),
    ).not.toThrow();
    expect(() =>
      assertAdminGrantAllowed(user(1, RoleEnum.USER), user(2, RoleEnum.ADMIN), [
        RoleEnum.ADMIN,
      ]),
    ).not.toThrow();
    expect(() =>
      assertAdminGrantAllowed(user(1, RoleEnum.USER), null, [RoleEnum.USER]),
    ).not.toThrow();
  });

  it('recognizes only live, active users with a live, active ADMIN role', () => {
    expect(hasActiveAdminRole(user(1, RoleEnum.ADMIN))).toBe(true);
    expect(hasActiveAdminRole(user(1, RoleEnum.USER))).toBe(false);
    expect(
      hasActiveAdminRole(user(1, RoleEnum.ADMIN, RecordStatus.INACTIVE)),
    ).toBe(false);
    expect(
      hasActiveAdminRole({
        ...user(1, RoleEnum.ADMIN),
        deletedAt: new Date(),
      } as UserEntity),
    ).toBe(false);
    expect(
      hasActiveAdminRole({
        ...user(1, RoleEnum.ADMIN),
        roles: [
          {
            name: RoleEnum.ADMIN,
            status: RecordStatus.INACTIVE,
            deletedAt: null,
          },
        ],
      } as UserEntity),
    ).toBe(false);
  });

  it('forbids self deactivation and self deletion, while allowing activation and other users', () => {
    const target = user(1, RoleEnum.USER);
    expect(() =>
      assertMayDeactivateSelf(target, 1, RecordStatus.INACTIVE),
    ).toThrow(SelfDeactivationForbiddenError);
    expect(() => assertMayDeleteSelf(target, 1)).toThrow(
      SelfDeletionForbiddenError,
    );
    expect(() =>
      assertMayDeactivateSelf(target, 1, RecordStatus.ACTIVE),
    ).not.toThrow();
    expect(() =>
      assertMayDeactivateSelf(target, 2, RecordStatus.INACTIVE),
    ).not.toThrow();
    expect(() => assertMayDeleteSelf(target, 2)).not.toThrow();
  });

  it('requires an active admin to remain only when one is removed', () => {
    expect(() => assertActiveAdminRemains(true, 1)).toThrow(
      LastActiveAdminError,
    );
    expect(() => assertActiveAdminRemains(true, 2)).not.toThrow();
    expect(() => assertActiveAdminRemains(false, 0)).not.toThrow();
  });

  it('detects ADMIN membership regardless of user or role status', () => {
    expect(hasAdminRole(user(1, RoleEnum.ADMIN, RecordStatus.INACTIVE))).toBe(
      true,
    );
    expect(hasAdminRole(user(1, RoleEnum.USER))).toBe(false);
  });

  it('lets only an active admin manage an admin, and anyone with access manage a non-admin', () => {
    const target = user(1, RoleEnum.ADMIN);

    expect(() =>
      assertMayManageAdmin(user(2, RoleEnum.ADMIN), target),
    ).not.toThrow();
    expect(() => assertMayManageAdmin(user(2, RoleEnum.USER), target)).toThrow(
      AdminTargetForbiddenError,
    );
    expect(() =>
      assertMayManageAdmin(
        user(2, RoleEnum.ADMIN, RecordStatus.INACTIVE),
        target,
      ),
    ).toThrow(AdminTargetForbiddenError);
    expect(() => assertMayManageAdmin(null, target)).toThrow(
      AdminTargetForbiddenError,
    );
    expect(() =>
      assertMayManageAdmin(user(2, RoleEnum.USER), user(1, RoleEnum.USER)),
    ).not.toThrow();
  });

  it('never lets an admin lose ADMIN, but lets a non-admin change roles freely', () => {
    expect(() =>
      assertAdminRoleRetained(user(1, RoleEnum.ADMIN), [RoleEnum.USER]),
    ).toThrow(AdminRoleRemovalForbiddenError);
    expect(() =>
      assertAdminRoleRetained(user(1, RoleEnum.ADMIN), [
        RoleEnum.ADMIN,
        RoleEnum.USER,
      ]),
    ).not.toThrow();
    expect(() =>
      assertAdminRoleRetained(user(1, RoleEnum.USER), []),
    ).not.toThrow();
  });

  it('requires approval only when someone other than the admin edits them', () => {
    const admin = user(1, RoleEnum.ADMIN);

    expect(requiresAdminChangeApproval(2, admin)).toBe(true);
    expect(requiresAdminChangeApproval(null, admin)).toBe(true);
    expect(requiresAdminChangeApproval(1, admin)).toBe(false);
    expect(requiresAdminChangeApproval(2, user(1, RoleEnum.USER))).toBe(false);
  });
});
