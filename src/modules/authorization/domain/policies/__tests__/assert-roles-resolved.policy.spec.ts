import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { RoleEntity } from '../../entities/role.entity';
import { RoleEnum } from '../../enums/role.enum';
import { InactiveRoleError } from '../../errors/inactive-role.error';
import { RoleNotFoundError } from '../../errors/role-not-found.error';
import { assertRolesResolved } from '../assert-roles-resolved.policy';

function buildRole(
  uuid: string,
  status: RecordStatus = RecordStatus.ACTIVE,
): RoleEntity {
  return RoleEntity.reconstitute({
    id: 1,
    uuid,
    status,
    name: RoleEnum.USER,
    abilities: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
  });
}

describe('assertRolesResolved', () => {
  it('accepts when every requested role resolved to an active role', () => {
    expect(() =>
      assertRolesResolved(
        ['role-1', 'role-2'],
        [buildRole('role-1'), buildRole('role-2')],
      ),
    ).not.toThrow();
  });

  it('accepts a request that repeats the same role uuid', () => {
    expect(() =>
      assertRolesResolved(['role-1', 'role-1'], [buildRole('role-1')]),
    ).not.toThrow();
  });

  it('throws RoleNotFoundError when a requested role did not resolve', () => {
    expect(() =>
      assertRolesResolved(['role-1', 'missing'], [buildRole('role-1')]),
    ).toThrow(RoleNotFoundError);
  });

  it('throws InactiveRoleError when a resolved role is not active', () => {
    expect(() =>
      assertRolesResolved(
        ['role-1', 'role-2'],
        [buildRole('role-1'), buildRole('role-2', RecordStatus.INACTIVE)],
      ),
    ).toThrow(InactiveRoleError);
  });

  it('reports a missing role before an inactive one', () => {
    expect(() =>
      assertRolesResolved(
        ['role-1', 'missing'],
        [buildRole('role-1', RecordStatus.INACTIVE)],
      ),
    ).toThrow(RoleNotFoundError);
  });
});
