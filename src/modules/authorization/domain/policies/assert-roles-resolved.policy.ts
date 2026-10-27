import { assertRecordActive } from '@shared/domain/policies';
import { RoleEntity } from '../entities/role.entity';
import { InactiveRoleError } from '../errors/inactive-role.error';
import { RoleNotFoundError } from '../errors/role-not-found.error';

export function assertRolesResolved(
  requestedUuids: readonly string[],
  roles: readonly RoleEntity[],
): void {
  const resolvedUuids = new Set(roles.map((role) => role.uuid));

  if (requestedUuids.some((uuid) => !resolvedUuids.has(uuid))) {
    throw new RoleNotFoundError();
  }

  for (const role of roles) {
    assertRecordActive(role, new InactiveRoleError());
  }
}
