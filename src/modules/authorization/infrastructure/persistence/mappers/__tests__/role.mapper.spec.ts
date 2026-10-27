import { Action } from '@shared/domain/enums/action.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { Subject } from '@shared/domain/authorization/subject';
import { AbilityEntity } from '../../../../domain/entities/ability.entity';
import { RoleEntity } from '../../../../domain/entities/role.entity';
import { RoleEnum } from '../../../../domain/enums/role.enum';
import { AbilityOrmEntity } from '../../entities/ability.orm-entity';
import { RoleOrmEntity } from '../../entities/role.orm-entity';
import { RoleMapper } from '../role.mapper';

describe('RoleMapper', () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const updatedAt = new Date('2026-01-02T00:00:00.000Z');

  function buildAbilityOrm(): AbilityOrmEntity {
    const orm = new AbilityOrmEntity();
    orm.id = 1;
    orm.uuid = 'ability-uuid';
    orm.status = RecordStatus.ACTIVE;
    orm.action = Action.READ;
    orm.subject = Subject.USER;
    orm.createdAt = createdAt;
    orm.updatedAt = updatedAt;
    orm.deletedAt = null;
    return orm;
  }

  it('maps an ORM role with its abilities relation to a domain RoleEntity', () => {
    const orm = new RoleOrmEntity();
    orm.id = 1;
    orm.uuid = 'role-uuid';
    orm.status = RecordStatus.ACTIVE;
    orm.name = RoleEnum.ADMIN;
    orm.abilities = [buildAbilityOrm()];
    orm.createdAt = createdAt;
    orm.updatedAt = updatedAt;
    orm.deletedAt = null;

    const domain = RoleMapper.toDomain(orm);

    expect(domain).toBeInstanceOf(RoleEntity);
    expect(domain.name).toBe(RoleEnum.ADMIN);
    expect(domain.abilities).toHaveLength(1);
    expect(domain.abilities[0]).toBeInstanceOf(AbilityEntity);
    expect(domain.abilities[0].subject).toBe(Subject.USER);
  });

  it('defaults abilities to an empty array when the relation was not loaded', () => {
    const orm = new RoleOrmEntity();
    orm.id = 1;
    orm.uuid = 'role-uuid';
    orm.status = RecordStatus.ACTIVE;
    orm.name = RoleEnum.USER;
    orm.createdAt = createdAt;
    orm.updatedAt = updatedAt;
    orm.deletedAt = null;

    const domain = RoleMapper.toDomain(orm);

    expect(domain.abilities).toEqual([]);
  });

  it('maps a domain RoleEntity (with abilities) to an ORM entity', () => {
    const ability = AbilityEntity.reconstitute({
      id: 1,
      uuid: 'ability-uuid',
      status: RecordStatus.ACTIVE,
      action: Action.READ,
      subject: Subject.USER,
      createdAt,
      updatedAt,
      deletedAt: null,
    });

    const domain = RoleEntity.reconstitute({
      id: 1,
      uuid: 'role-uuid',
      status: RecordStatus.ACTIVE,
      name: RoleEnum.USER,
      abilities: [ability],
      createdAt,
      updatedAt,
      deletedAt: null,
    });

    const orm = RoleMapper.toOrm(domain);

    expect(orm).toBeInstanceOf(RoleOrmEntity);
    expect(orm.name).toBe(RoleEnum.USER);
    expect(orm.abilities).toHaveLength(1);
    expect(orm.abilities[0]).toBeInstanceOf(AbilityOrmEntity);
    expect(orm.abilities[0].subject).toBe(Subject.USER);
  });
});
