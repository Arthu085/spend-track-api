import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { Action } from '@shared/domain/enums/action.enum';
import { Subject } from '@shared/domain/authorization/subject';
import { AbilityEntity } from '../ability.entity';
import { RoleEnum } from '../../enums/role.enum';
import { RoleEntity } from '../role.entity';

function buildAbility(action: Action, subject: Subject): AbilityEntity {
  return AbilityEntity.reconstitute({
    id: 1,
    uuid: 'ability-uuid',
    status: RecordStatus.ACTIVE,
    action,
    subject,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
  });
}

describe('RoleEntity', () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const updatedAt = new Date('2026-01-02T00:00:00.000Z');

  it('reconstitutes a role with its abilities', () => {
    const ability = buildAbility(Action.READ, Subject.USER);

    const role = RoleEntity.reconstitute({
      id: 1,
      uuid: 'role-uuid',
      status: RecordStatus.ACTIVE,
      name: RoleEnum.ADMIN,
      abilities: [ability],
      createdAt,
      updatedAt,
      deletedAt: null,
    });

    expect(role.id).toBe(1);
    expect(role.uuid).toBe('role-uuid');
    expect(role.name).toBe(RoleEnum.ADMIN);
    expect(role.abilities).toEqual([ability]);
    expect(role.status).toBe(RecordStatus.ACTIVE);
    expect(role.createdAt).toBe(createdAt);
    expect(role.deletedAt).toBeNull();
  });

  it('withAbilities returns a new instance with the replaced ability set and a fresh updatedAt', () => {
    const role = RoleEntity.reconstitute({
      id: 1,
      uuid: 'role-uuid',
      status: RecordStatus.ACTIVE,
      name: RoleEnum.USER,
      abilities: [],
      createdAt,
      updatedAt,
      deletedAt: null,
    });

    const newAbility = buildAbility(Action.UPDATE, Subject.ROLE);
    const updated = role.withAbilities([newAbility]);

    expect(updated).not.toBe(role);
    expect(updated.abilities).toEqual([newAbility]);
    expect(updated.id).toBe(role.id);
    expect(updated.uuid).toBe(role.uuid);
    expect(updated.name).toBe(role.name);
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
      updatedAt.getTime(),
    );
    expect(role.abilities).toEqual([]);
  });
});
