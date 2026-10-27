import { RoleEnum } from '@modules/authorization';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { UserEntity } from '../entities/user.entity';
import { AdminRoleGrantForbiddenError } from '../errors/admin-role-grant-forbidden.error';
import { AdminRoleRemovalForbiddenError } from '../errors/admin-role-removal-forbidden.error';
import { AdminTargetForbiddenError } from '../errors/admin-target-forbidden.error';
import { LastActiveAdminError } from '../errors/last-active-admin.error';
import { SelfDeactivationForbiddenError } from '../errors/self-deactivation-forbidden.error';
import { SelfDeletionForbiddenError } from '../errors/self-deletion-forbidden.error';

export function hasActiveAdminRole(user: UserEntity | null): boolean {
  return (
    user?.status === RecordStatus.ACTIVE &&
    user.deletedAt === null &&
    user.roles.some(
      (role) =>
        role.name === RoleEnum.ADMIN &&
        role.status === RecordStatus.ACTIVE &&
        role.deletedAt === null,
    )
  );
}

export function hasAdminRole(user: UserEntity): boolean {
  return user.roles.some((role) => role.name === RoleEnum.ADMIN);
}

export function assertMayManageAdmin(
  actor: UserEntity | null,
  target: UserEntity,
): void {
  if (hasAdminRole(target) && !hasActiveAdminRole(actor)) {
    throw new AdminTargetForbiddenError();
  }
}

export function assertAdminRoleRetained(
  currentUser: UserEntity,
  nextRoleNames: RoleEnum[],
): void {
  if (hasAdminRole(currentUser) && !nextRoleNames.includes(RoleEnum.ADMIN)) {
    throw new AdminRoleRemovalForbiddenError();
  }
}

export function requiresAdminChangeApproval(
  actorId: number | null,
  target: UserEntity,
): boolean {
  return hasAdminRole(target) && actorId !== target.id;
}

export function assertAdminGrantAllowed(
  actor: UserEntity | null,
  currentUser: UserEntity | null,
  nextRoleNames: RoleEnum[],
): void {
  if (
    nextRoleNames.includes(RoleEnum.ADMIN) &&
    !currentUser?.roles.some((role) => role.name === RoleEnum.ADMIN) &&
    !hasActiveAdminRole(actor)
  ) {
    throw new AdminRoleGrantForbiddenError();
  }
}

export function assertMayDeactivateSelf(
  user: UserEntity,
  actorId: number | null,
  nextStatus: RecordStatus,
): void {
  if (nextStatus === RecordStatus.INACTIVE && user.id === actorId) {
    throw new SelfDeactivationForbiddenError();
  }
}

export function assertMayDeleteSelf(
  user: UserEntity,
  actorId: number | null,
): void {
  if (user.id === actorId) {
    throw new SelfDeletionForbiddenError();
  }
}

export function assertActiveAdminRemains(
  removesActiveAdmin: boolean,
  activeAdminCount: number,
): void {
  if (removesActiveAdmin && activeAdminCount <= 1) {
    throw new LastActiveAdminError();
  }
}
