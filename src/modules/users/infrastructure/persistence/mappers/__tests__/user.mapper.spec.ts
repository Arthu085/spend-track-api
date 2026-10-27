import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { RoleEntity } from '@modules/authorization/domain/entities/role.entity';
import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import { RoleOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/role.orm-entity';
import { UserEntity } from '../../../../domain/entities/user.entity';
import { UserOrmEntity } from '../../entities/user.orm-entity';
import { UserMapper } from '../user.mapper';

function buildRoleOrm(): RoleOrmEntity {
  const orm = new RoleOrmEntity();
  orm.id = 1;
  orm.uuid = 'role-uuid';
  orm.status = RecordStatus.ACTIVE;
  orm.name = RoleEnum.USER;
  orm.abilities = [];
  orm.createdAt = new Date();
  orm.updatedAt = new Date();
  orm.deletedAt = null;
  return orm;
}

function buildRoleDomain(): RoleEntity {
  return RoleEntity.reconstitute({
    id: 1,
    uuid: 'role-uuid',
    status: RecordStatus.ACTIVE,
    name: RoleEnum.USER,
    abilities: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

describe('UserMapper', () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const updatedAt = new Date('2026-01-02T00:00:00.000Z');

  it('maps an ORM row (with roles) to a domain UserEntity', () => {
    const orm = new UserOrmEntity();
    orm.id = 1;
    orm.uuid = 'user-uuid';
    orm.status = RecordStatus.ACTIVE;
    orm.name = 'Jane Doe';
    orm.email = 'jane@example.com';
    orm.password = 'hashed-password';
    orm.emailConfirmedAt = null;
    orm.createdBy = 101;
    orm.updatedBy = null;
    orm.deletedBy = null;
    orm.roles = [buildRoleOrm()];
    orm.createdAt = createdAt;
    orm.updatedAt = updatedAt;
    orm.deletedAt = null;

    const domain = UserMapper.toDomain(orm);

    expect(domain).toBeInstanceOf(UserEntity);
    expect(domain.uuid).toBe('user-uuid');
    expect(domain.email).toBe('jane@example.com');
    expect(domain.password).toBe('hashed-password');
    expect(domain.roles).toHaveLength(1);
    expect(domain.roles[0]).toBeInstanceOf(RoleEntity);
    expect(domain.createdBy).toBe(101);
    expect(domain.updatedBy).toBeNull();
    expect(domain.deletedBy).toBeNull();
  });

  it('defaults roles to an empty array when the relation was not loaded', () => {
    const orm = new UserOrmEntity();
    orm.id = 1;
    orm.uuid = 'user-uuid';
    orm.status = RecordStatus.ACTIVE;
    orm.name = 'Jane Doe';
    orm.email = 'jane@example.com';
    orm.password = 'hashed-password';
    orm.emailConfirmedAt = null;
    orm.createdBy = null;
    orm.updatedBy = null;
    orm.deletedBy = null;
    orm.createdAt = createdAt;
    orm.updatedAt = updatedAt;
    orm.deletedAt = null;

    const domain = UserMapper.toDomain(orm);

    expect(domain.roles).toEqual([]);
  });

  it('maps a domain UserEntity (new, id=0) to an ORM entity without setting the numeric id', () => {
    const domain = UserEntity.create({
      uuid: 'user-uuid',
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'hashed-password',
      roles: [buildRoleDomain()],
      createdBy: 101,
    });

    const orm = UserMapper.toOrm(domain);

    expect(orm).toBeInstanceOf(UserOrmEntity);
    expect(orm.id).toBeUndefined();
    expect(orm.uuid).toBe('user-uuid');
    expect(orm.email).toBe('jane@example.com');
    expect(orm.roles).toHaveLength(1);
    expect(orm.roles[0]).toBeInstanceOf(RoleOrmEntity);
  });

  it('maps a domain UserEntity (persisted, id>0) to an ORM entity preserving the numeric id', () => {
    const domain = UserEntity.reconstitute({
      id: 7,
      uuid: 'user-uuid',
      status: RecordStatus.ACTIVE,
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'hashed-password',
      emailConfirmedAt: null,
      roles: [],
      createdAt,
      updatedAt,
      deletedAt: null,
      createdBy: null,
      updatedBy: null,
      deletedBy: null,
    });

    const orm = UserMapper.toOrm(domain);

    expect(orm.id).toBe(7);
  });

  it('maps the soft-delete actor between domain and ORM', () => {
    const deleted = UserEntity.create({
      uuid: 'user-uuid',
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'hashed-password',
      roles: [],
      createdBy: 101,
    }).markDeleted(102);

    const orm = UserMapper.toOrm(deleted);

    expect(orm.deletedBy).toBe(102);
    expect(UserMapper.toDomain(orm).deletedBy).toBe(102);
  });

  it('resolves creatorName/updaterName from the actorNames map when both uuids are present', () => {
    const orm = new UserOrmEntity();
    orm.id = 1;
    orm.uuid = 'user-uuid';
    orm.status = RecordStatus.ACTIVE;
    orm.name = 'Jane Doe';
    orm.email = 'jane@example.com';
    orm.password = 'hashed-password';
    orm.emailConfirmedAt = null;
    orm.createdBy = 101;
    orm.updatedBy = 102;
    orm.deletedBy = null;
    orm.roles = [];
    orm.createdAt = createdAt;
    orm.updatedAt = updatedAt;
    orm.deletedAt = null;

    const actorNames = new Map([
      [101, 'Creator Name'],
      [102, 'Updater Name'],
    ]);

    const domain = UserMapper.toDomain(orm, actorNames);

    expect(domain.creatorName).toBe('Creator Name');
    expect(domain.updaterName).toBe('Updater Name');
  });

  it('resolves creatorName/updaterName to null when the scalars are null, regardless of the map', () => {
    const orm = new UserOrmEntity();
    orm.id = 1;
    orm.uuid = 'user-uuid';
    orm.status = RecordStatus.ACTIVE;
    orm.name = 'Jane Doe';
    orm.email = 'jane@example.com';
    orm.password = 'hashed-password';
    orm.emailConfirmedAt = null;
    orm.createdBy = null;
    orm.updatedBy = null;
    orm.deletedBy = null;
    orm.roles = [];
    orm.createdAt = createdAt;
    orm.updatedAt = updatedAt;
    orm.deletedAt = null;

    const actorNames = new Map([[101, 'Creator Name']]);

    const domain = UserMapper.toDomain(orm, actorNames);

    expect(domain.creatorName).toBeNull();
    expect(domain.updaterName).toBeNull();
  });

  it('resolves creatorName/updaterName to null when the scalar uuid is absent from the map, without throwing', () => {
    const orm = new UserOrmEntity();
    orm.id = 1;
    orm.uuid = 'user-uuid';
    orm.status = RecordStatus.ACTIVE;
    orm.name = 'Jane Doe';
    orm.email = 'jane@example.com';
    orm.password = 'hashed-password';
    orm.emailConfirmedAt = null;
    orm.createdBy = 999;
    orm.updatedBy = 999;
    orm.deletedBy = null;
    orm.roles = [];
    orm.createdAt = createdAt;
    orm.updatedAt = updatedAt;
    orm.deletedAt = null;

    const actorNames = new Map([[101, 'Creator Name']]);

    expect(() => UserMapper.toDomain(orm, actorNames)).not.toThrow();

    const domain = UserMapper.toDomain(orm, actorNames);

    expect(domain.creatorName).toBeNull();
    expect(domain.updaterName).toBeNull();
  });

  it('resolves creatorName/updaterName to null when called without an actorNames map at all', () => {
    const orm = new UserOrmEntity();
    orm.id = 1;
    orm.uuid = 'user-uuid';
    orm.status = RecordStatus.ACTIVE;
    orm.name = 'Jane Doe';
    orm.email = 'jane@example.com';
    orm.password = 'hashed-password';
    orm.emailConfirmedAt = null;
    orm.createdBy = 101;
    orm.updatedBy = 102;
    orm.deletedBy = null;
    orm.roles = [];
    orm.createdAt = createdAt;
    orm.updatedAt = updatedAt;
    orm.deletedAt = null;

    const domain = UserMapper.toDomain(orm);

    expect(domain.creatorName).toBeNull();
    expect(domain.updaterName).toBeNull();
  });

  it('toOrm output never carries creatorName/updaterName', () => {
    const domain = UserEntity.reconstitute({
      id: 7,
      uuid: 'user-uuid',
      status: RecordStatus.ACTIVE,
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'hashed-password',
      emailConfirmedAt: null,
      roles: [],
      createdAt,
      updatedAt,
      deletedAt: null,
      createdBy: 101,
      updatedBy: 102,
      deletedBy: null,
      creatorName: 'Creator Name',
      updaterName: 'Updater Name',
    });

    const orm = UserMapper.toOrm(domain);

    expect(Object.prototype.hasOwnProperty.call(orm, 'creatorName')).toBe(
      false,
    );
    expect(Object.prototype.hasOwnProperty.call(orm, 'updaterName')).toBe(
      false,
    );
  });

  it('carries updatedAt over onto the ORM entity (regression: role-only updates were silently dropping updated_at)', () => {
    const domain = UserEntity.reconstitute({
      id: 7,
      uuid: 'user-uuid',
      status: RecordStatus.ACTIVE,
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'hashed-password',
      emailConfirmedAt: null,
      roles: [],
      createdAt,
      updatedAt,
      deletedAt: null,
      createdBy: null,
      updatedBy: null,
      deletedBy: null,
    });

    const orm = UserMapper.toOrm(domain);

    expect(orm.updatedAt).toEqual(domain.updatedAt);
  });

  it('leaves updatedAt unset for a new user so the insert uses the same database timestamp as createdAt', () => {
    const orm = UserMapper.toOrm(
      UserEntity.create({
        uuid: 'user-uuid',
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'hashed-password',
        roles: [],
        createdBy: null,
      }),
    );

    expect(orm.updatedAt).toBeUndefined();
  });

  it('toDomain maps a set emailConfirmedAt through unchanged', () => {
    const confirmedAt = new Date('2026-01-05T00:00:00.000Z');
    const orm = new UserOrmEntity();
    orm.id = 1;
    orm.uuid = 'user-uuid';
    orm.status = RecordStatus.ACTIVE;
    orm.name = 'Jane Doe';
    orm.email = 'jane@example.com';
    orm.password = 'hashed-password';
    orm.emailConfirmedAt = confirmedAt;
    orm.createdBy = null;
    orm.updatedBy = null;
    orm.deletedBy = null;
    orm.roles = [];
    orm.createdAt = createdAt;
    orm.updatedAt = updatedAt;
    orm.deletedAt = null;

    const domain = UserMapper.toDomain(orm);

    expect(domain.emailConfirmedAt).toBe(confirmedAt);
  });

  it('toOrm maps a set emailConfirmedAt through unchanged', () => {
    const confirmedAt = new Date('2026-01-05T00:00:00.000Z');

    const domain = UserEntity.reconstitute({
      id: 7,
      uuid: 'user-uuid',
      status: RecordStatus.ACTIVE,
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'hashed-password',
      emailConfirmedAt: confirmedAt,
      roles: [],
      createdAt,
      updatedAt,
      deletedAt: null,
      createdBy: null,
      updatedBy: null,
      deletedBy: null,
    });

    const orm = UserMapper.toOrm(domain);

    expect(orm.emailConfirmedAt).toBe(confirmedAt);
  });
});
