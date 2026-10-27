import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { RoleEntity } from '@modules/authorization/domain/entities/role.entity';
import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import { UserEntity } from '../user.entity';

function buildRole(key: RoleEnum): RoleEntity {
  return RoleEntity.reconstitute({
    id: 1,
    uuid: `role-${key}`,
    status: RecordStatus.ACTIVE,
    name: key,
    abilities: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

function buildConfirmedUser(): UserEntity {
  return UserEntity.reconstitute({
    id: 1,
    uuid: 'user-uuid',
    status: RecordStatus.ACTIVE,
    name: 'Jane Doe',
    email: 'jane@example.com',
    password: 'hashed-password',
    emailConfirmedAt: new Date('2026-01-01T00:00:00.000Z'),
    roles: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdBy: 101,
    updatedBy: 101,
    deletedBy: null,
  });
}

describe('UserEntity', () => {
  it('create builds an active user with the same createdAt/updatedAt and createdBy as updatedBy', () => {
    const roles = [buildRole(RoleEnum.USER)];

    const user = UserEntity.create({
      uuid: 'user-uuid',
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'hashed-password',
      roles,
      createdBy: 101,
    });

    expect(user.uuid).toBe('user-uuid');
    expect(user.name).toBe('Jane Doe');
    expect(user.email).toBe('jane@example.com');
    expect(user.password).toBe('hashed-password');
    expect(user.roles).toBe(roles);
    expect(user.status).toBe(RecordStatus.ACTIVE);
    expect(user.emailConfirmedAt).toBeNull();
    expect(user.deletedAt).toBeNull();
    expect(user.createdBy).toBe(101);
    expect(user.updatedBy).toBe(101);
    expect(user.deletedBy).toBeNull();
    expect(user.createdAt).toEqual(user.updatedAt);
  });

  it('create defaults createdBy/updatedBy to null when no actor is known', () => {
    const user = UserEntity.create({
      uuid: 'user-uuid',
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'hashed-password',
      roles: [],
      createdBy: null,
    });

    expect(user.createdBy).toBeNull();
    expect(user.updatedBy).toBeNull();
  });

  it('create defaults creatorName/updaterName to null regardless of createdBy', () => {
    const user = UserEntity.create({
      uuid: 'user-uuid',
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'hashed-password',
      roles: [],
      createdBy: 101,
    });

    expect(user.creatorName).toBeNull();
    expect(user.updaterName).toBeNull();
  });

  it('reconstitute restores every persisted field', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    const emailConfirmedAt = new Date('2026-01-03T00:00:00.000Z');
    const roles = [buildRole(RoleEnum.ADMIN)];

    const user = UserEntity.reconstitute({
      id: 1,
      uuid: 'user-uuid',
      status: RecordStatus.ACTIVE,
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'hashed-password',
      emailConfirmedAt,
      roles,
      createdAt,
      updatedAt,
      deletedAt: null,
      createdBy: 101,
      updatedBy: 102,
      deletedBy: null,
    });

    expect(user.id).toBe(1);
    expect(user.emailConfirmedAt).toBe(emailConfirmedAt);
    expect(user.roles).toBe(roles);
    expect(user.createdBy).toBe(101);
    expect(user.updatedBy).toBe(102);
    expect(user.createdAt).toBe(createdAt);
    expect(user.updatedAt).toBe(updatedAt);
  });

  it('reconstitute carries creatorName/updaterName onto the entity when provided', () => {
    const user = UserEntity.reconstitute({
      id: 1,
      uuid: 'user-uuid',
      status: RecordStatus.ACTIVE,
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'hashed-password',
      emailConfirmedAt: null,
      roles: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: 101,
      updatedBy: 102,
      deletedBy: null,
      creatorName: 'Creator Name',
      updaterName: 'Updater Name',
    });

    expect(user.creatorName).toBe('Creator Name');
    expect(user.updaterName).toBe('Updater Name');
  });

  it('reconstitute defaults creatorName/updaterName to null when omitted', () => {
    const user = UserEntity.reconstitute({
      id: 1,
      uuid: 'user-uuid',
      status: RecordStatus.ACTIVE,
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'hashed-password',
      emailConfirmedAt: null,
      roles: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: 101,
      updatedBy: 102,
      deletedBy: null,
    });

    expect(user.creatorName).toBeNull();
    expect(user.updaterName).toBeNull();
  });

  describe('withProfile', () => {
    it('returns a new instance with updated profile fields, preserving the password', () => {
      const user = UserEntity.create({
        uuid: 'user-uuid',
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'hashed-password',
        roles: [buildRole(RoleEnum.USER)],
        createdBy: 101,
      });

      const newRoles = [buildRole(RoleEnum.ADMIN)];

      const updated = user.withProfile({
        name: 'Jane Updated',
        email: 'jane.updated@example.com',
        roles: newRoles,
        actorId: 102,
      });

      expect(updated).not.toBe(user);
      expect(updated.name).toBe('Jane Updated');
      expect(updated.email).toBe('jane.updated@example.com');
      expect(updated.roles).toBe(newRoles);
      expect(updated.password).toBe('hashed-password');
      expect(updated.createdBy).toBe(101);
      expect(updated.updatedBy).toBe(102);
      expect(updated.uuid).toBe(user.uuid);
      expect(updated.status).toBe(RecordStatus.ACTIVE);
    });

    it('clears emailConfirmedAt when the email actually changes', () => {
      const user = buildConfirmedUser();
      expect(user.emailConfirmedAt).not.toBeNull();

      const updated = user.withProfile({
        name: user.name,
        email: 'new-email@example.com',
        roles: [],
        actorId: 102,
      });

      expect(updated.emailConfirmedAt).toBeNull();
    });

    it('preserves an already-confirmed emailConfirmedAt when the email is unchanged', () => {
      const user = buildConfirmedUser();

      const updated = user.withProfile({
        name: 'New Name Only',
        email: user.email,
        roles: [],
        actorId: 102,
      });

      expect(updated.emailConfirmedAt).toBe(user.emailConfirmedAt);
    });

    it('preserves pre-existing creatorName/updaterName unchanged', () => {
      const user = UserEntity.reconstitute({
        id: 1,
        uuid: 'user-uuid',
        status: RecordStatus.ACTIVE,
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'hashed-password',
        emailConfirmedAt: null,
        roles: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 101,
        updatedBy: 101,
        deletedBy: null,
        creatorName: 'Creator Name',
        updaterName: 'Updater Name',
      });

      const updated = user.withProfile({
        name: 'Jane Updated',
        email: 'jane.updated@example.com',
        roles: [],
        actorId: 102,
      });

      expect(updated.creatorName).toBe('Creator Name');
      expect(updated.updaterName).toBe('Updater Name');
    });
  });

  describe('withEmailConfirmed', () => {
    it('sets emailConfirmedAt and updatedAt only, leaving every other field untouched', () => {
      const user = UserEntity.create({
        uuid: 'user-uuid',
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'hashed-password',
        roles: [buildRole(RoleEnum.USER)],
        createdBy: 101,
      });

      const confirmedAt = new Date('2026-05-01T00:00:00.000Z');
      const confirmed = user.withEmailConfirmed(confirmedAt);

      expect(confirmed).not.toBe(user);
      expect(confirmed.emailConfirmedAt).toBe(confirmedAt);
      expect(confirmed.updatedAt).toBeInstanceOf(Date);
      expect(confirmed.updatedAt.getTime()).toBeGreaterThanOrEqual(
        user.updatedAt.getTime(),
      );
      expect(confirmed.name).toBe(user.name);
      expect(confirmed.email).toBe(user.email);
      expect(confirmed.password).toBe(user.password);
      expect(confirmed.roles).toBe(user.roles);
      expect(confirmed.status).toBe(user.status);
      expect(confirmed.createdBy).toBe(user.createdBy);
      expect(confirmed.updatedBy).toBe(user.updatedBy);
    });
  });

  describe('withPassword', () => {
    it('changes only the password hash and updatedAt/updatedBy, leaving emailConfirmedAt untouched', () => {
      const user = buildConfirmedUser();

      const updated = user.withPassword('new-hashed-password', 102);

      expect(updated).not.toBe(user);
      expect(updated.password).toBe('new-hashed-password');
      expect(updated.updatedAt).toBeInstanceOf(Date);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        user.updatedAt.getTime(),
      );
      expect(updated.updatedBy).toBe(102);
      expect(updated.emailConfirmedAt).toBe(user.emailConfirmedAt);
      expect(updated.name).toBe(user.name);
      expect(updated.email).toBe(user.email);
      expect(updated.roles).toBe(user.roles);
      expect(updated.status).toBe(user.status);
    });
  });

  describe('markDeleted', () => {
    it('returns a new instance with deletedAt set and the actor recorded, leaving status unchanged', () => {
      const user = UserEntity.create({
        uuid: 'user-uuid',
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'hashed-password',
        roles: [],
        createdBy: 101,
      });

      const deleted = user.markDeleted(102);

      expect(deleted).not.toBe(user);
      expect(deleted.status).toBe(user.status);
      expect(deleted.status).toBe(RecordStatus.ACTIVE);
      expect(deleted.deletedAt).toBeInstanceOf(Date);
      expect(deleted.updatedBy).toBe(102);
      expect(deleted.deletedBy).toBe(102);
      expect(deleted.createdBy).toBe(101);
      expect(deleted.email).toBe(user.email);
      expect(deleted.password).toBe(user.password);
    });

    it('leaves an already-inactive status untouched', () => {
      const user = UserEntity.reconstitute({
        id: 1,
        uuid: 'user-uuid',
        status: RecordStatus.INACTIVE,
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'hashed-password',
        emailConfirmedAt: null,
        roles: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 101,
        updatedBy: 101,
        deletedBy: null,
      });

      const deleted = user.markDeleted(102);

      expect(deleted.status).toBe(RecordStatus.INACTIVE);
      expect(deleted.deletedAt).toBeInstanceOf(Date);
    });

    it('preserves emailConfirmedAt unchanged', () => {
      const user = buildConfirmedUser();

      const deleted = user.markDeleted(102);

      expect(deleted.emailConfirmedAt).toBe(user.emailConfirmedAt);
    });

    it('preserves pre-existing creatorName/updaterName unchanged', () => {
      const user = UserEntity.reconstitute({
        id: 1,
        uuid: 'user-uuid',
        status: RecordStatus.ACTIVE,
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'hashed-password',
        emailConfirmedAt: null,
        roles: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 101,
        updatedBy: 101,
        deletedBy: null,
        creatorName: 'Creator Name',
        updaterName: 'Updater Name',
      });

      const deleted = user.markDeleted(102);

      expect(deleted.creatorName).toBe('Creator Name');
      expect(deleted.updaterName).toBe('Updater Name');
    });
  });

  describe('withStatus', () => {
    it('returns a new instance with only status/updatedAt/updatedBy changed', () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const deletedAt = new Date('2026-01-05T00:00:00.000Z');
      const emailConfirmedAt = new Date('2026-01-02T00:00:00.000Z');
      const roles = [buildRole(RoleEnum.USER)];

      const user = UserEntity.reconstitute({
        id: 1,
        uuid: 'user-uuid',
        status: RecordStatus.ACTIVE,
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'hashed-password',
        emailConfirmedAt,
        roles,
        createdAt,
        updatedAt: createdAt,
        deletedAt,
        createdBy: 101,
        updatedBy: 101,
        deletedBy: null,
      });

      const updated = user.withStatus(RecordStatus.INACTIVE, 102);

      expect(updated).not.toBe(user);
      expect(updated.status).toBe(RecordStatus.INACTIVE);
      expect(updated.updatedBy).toBe(102);
      expect(updated.updatedAt).not.toEqual(createdAt);
      expect(updated.updatedAt).toBeInstanceOf(Date);
      expect(updated.deletedAt).toBe(deletedAt);
      expect(updated.createdAt).toBe(createdAt);
      expect(updated.uuid).toBe(user.uuid);
      expect(updated.name).toBe(user.name);
      expect(updated.email).toBe(user.email);
      expect(updated.password).toBe(user.password);
      expect(updated.emailConfirmedAt).toBe(user.emailConfirmedAt);
      expect(updated.roles).toBe(roles);
      expect(updated.createdBy).toBe(101);
    });

    it('preserves pre-existing creatorName/updaterName unchanged', () => {
      const user = UserEntity.reconstitute({
        id: 1,
        uuid: 'user-uuid',
        status: RecordStatus.ACTIVE,
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'hashed-password',
        emailConfirmedAt: null,
        roles: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 101,
        updatedBy: 101,
        deletedBy: null,
        creatorName: 'Creator Name',
        updaterName: 'Updater Name',
      });

      const updated = user.withStatus(RecordStatus.INACTIVE, 102);

      expect(updated.creatorName).toBe('Creator Name');
      expect(updated.updaterName).toBe('Updater Name');
    });
  });
});
