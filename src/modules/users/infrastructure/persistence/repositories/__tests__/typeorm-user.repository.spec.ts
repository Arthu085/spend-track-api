import {
  QueryFailedError,
  type FindOperator,
  type ObjectLiteral,
  type Repository,
  type SelectQueryBuilder,
} from 'typeorm';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import { RoleOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/role.orm-entity';
import { UserEntity } from '../../../../domain/entities/user.entity';
import { EmailAlreadyInUseError } from '../../../../domain/errors/email-already-in-use.error';
import { UserOrmEntity } from '../../entities/user.orm-entity';
import { TypeOrmUserRepository } from '../typeorm-user.repository';

function buildOrmUser(): UserOrmEntity {
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
  orm.createdAt = new Date();
  orm.updatedAt = new Date();
  orm.deletedAt = null;
  return orm;
}

function buildOrmUserWithActors(
  createdBy: number | null,
  updatedBy: number | null,
): UserOrmEntity {
  const orm = buildOrmUser();
  orm.createdBy = createdBy;
  orm.updatedBy = updatedBy;
  return orm;
}

function buildActorRow(id: number, name: string): UserOrmEntity {
  const orm = buildOrmUser();
  orm.id = id;
  orm.name = name;
  return orm;
}

function buildUniqueViolation(constraint: string): QueryFailedError {
  return new QueryFailedError(
    'INSERT',
    [],
    Object.assign(new Error('duplicate key'), { code: '23505', constraint }),
  );
}

function buildDomainUser(): UserEntity {
  return UserEntity.reconstitute({
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
    createdBy: null,
    updatedBy: null,
    deletedBy: null,
  });
}

interface QueryBuilderMock {
  qb: SelectQueryBuilder<ObjectLiteral>;
  leftJoinAndSelect: jest.Mock;
  orderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  andWhere: jest.Mock;
  getManyAndCount: jest.Mock;
}

function buildQueryBuilderMock(
  rows: UserOrmEntity[],
  total: number,
): QueryBuilderMock {
  const leftJoinAndSelect = jest.fn();
  const orderBy = jest.fn();
  const skip = jest.fn();
  const take = jest.fn();
  const andWhere = jest.fn();
  const getManyAndCount = jest.fn().mockResolvedValue([rows, total]);

  const qb = {
    leftJoinAndSelect: leftJoinAndSelect.mockReturnThis(),
    orderBy: orderBy.mockReturnThis(),
    skip: skip.mockReturnThis(),
    take: take.mockReturnThis(),
    andWhere: andWhere.mockReturnThis(),
    getManyAndCount,
  } as unknown as SelectQueryBuilder<ObjectLiteral>;

  return {
    qb,
    leftJoinAndSelect,
    orderBy,
    skip,
    take,
    andWhere,
    getManyAndCount,
  };
}

describe('TypeOrmUserRepository', () => {
  describe('findAllPaginated', () => {
    it('builds the query via createQueryBuilder, joins only roles, paginates and maps rows', async () => {
      const { qb, leftJoinAndSelect, orderBy, skip, take, getManyAndCount } =
        buildQueryBuilderMock([buildOrmUser()], 1);

      const createQueryBuilder = jest.fn().mockReturnValue(qb);

      const repository = {
        createQueryBuilder,
      } as unknown as Repository<UserOrmEntity>;

      const adapter = new TypeOrmUserRepository(repository);

      const result = await adapter.findAllPaginated(0, 20);

      expect(createQueryBuilder).toHaveBeenCalledWith('user');
      expect(leftJoinAndSelect).toHaveBeenCalledTimes(1);
      expect(leftJoinAndSelect).toHaveBeenCalledWith('user.roles', 'role');
      expect(orderBy).toHaveBeenCalledWith('user.id', 'DESC');
      expect(skip).toHaveBeenCalledWith(0);
      expect(take).toHaveBeenCalledWith(20);
      expect(getManyAndCount).toHaveBeenCalledTimes(1);
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toBeInstanceOf(UserEntity);
    });

    it('applies an ILIKE filter on user.name when a name filter is given', async () => {
      const { qb, andWhere } = buildQueryBuilderMock([buildOrmUser()], 1);
      const createQueryBuilder = jest.fn().mockReturnValue(qb);

      const repository = {
        createQueryBuilder,
      } as unknown as Repository<UserOrmEntity>;

      const adapter = new TypeOrmUserRepository(repository);

      await adapter.findAllPaginated(0, 20, { name: 'ali' });

      expect(andWhere).toHaveBeenCalledWith('user.name ILIKE :name', {
        name: '%ali%',
      });
    });

    it('applies an ILIKE filter on user.email when an email filter is given', async () => {
      const { qb, andWhere } = buildQueryBuilderMock([buildOrmUser()], 1);
      const createQueryBuilder = jest.fn().mockReturnValue(qb);

      const repository = {
        createQueryBuilder,
      } as unknown as Repository<UserOrmEntity>;

      const adapter = new TypeOrmUserRepository(repository);

      await adapter.findAllPaginated(0, 20, { email: 'jane@example.com' });

      expect(andWhere).toHaveBeenCalledWith('user.email ILIKE :email', {
        email: '%jane@example.com%',
      });
    });

    it('applies an exact filter on user.status when a status filter is given', async () => {
      const { qb, andWhere } = buildQueryBuilderMock([buildOrmUser()], 1);
      const createQueryBuilder = jest.fn().mockReturnValue(qb);

      const repository = {
        createQueryBuilder,
      } as unknown as Repository<UserOrmEntity>;

      const adapter = new TypeOrmUserRepository(repository);

      await adapter.findAllPaginated(0, 20, { status: RecordStatus.INACTIVE });

      expect(andWhere).toHaveBeenCalledWith('user.status = :status', {
        status: RecordStatus.INACTIVE,
      });
    });

    it('applies the role subquery filter only when filters.role is set', async () => {
      const { qb, andWhere } = buildQueryBuilderMock([buildOrmUser()], 1);
      const createQueryBuilder = jest.fn().mockReturnValue(qb);

      const repository = {
        createQueryBuilder,
      } as unknown as Repository<UserOrmEntity>;

      const adapter = new TypeOrmUserRepository(repository);

      await adapter.findAllPaginated(0, 20, { role: 'role-uuid' });

      expect(andWhere).toHaveBeenCalledWith(
        `user.id IN (
          SELECT
            user_roles.user_id
          FROM user_roles
            INNER JOIN roles ON roles.id = user_roles.role_id
          WHERE roles.uuid = :role
        )`,
        { role: 'role-uuid' },
      );
    });

    it('does not apply the role subquery filter when filters.role is absent', async () => {
      const { qb, andWhere } = buildQueryBuilderMock([buildOrmUser()], 1);
      const createQueryBuilder = jest.fn().mockReturnValue(qb);

      const repository = {
        createQueryBuilder,
      } as unknown as Repository<UserOrmEntity>;

      const adapter = new TypeOrmUserRepository(repository);

      await adapter.findAllPaginated(0, 20, {});

      expect(andWhere).not.toHaveBeenCalled();
    });

    it('applies no filters when none are given', async () => {
      const { qb, andWhere } = buildQueryBuilderMock([buildOrmUser()], 1);
      const createQueryBuilder = jest.fn().mockReturnValue(qb);

      const repository = {
        createQueryBuilder,
      } as unknown as Repository<UserOrmEntity>;

      const adapter = new TypeOrmUserRepository(repository);

      await adapter.findAllPaginated(0, 20);

      expect(andWhere).not.toHaveBeenCalled();
    });
  });

  it('findByUuid returns null when no row matches', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const repository = { findOne } as unknown as Repository<UserOrmEntity>;
    const adapter = new TypeOrmUserRepository(repository);

    await expect(adapter.findByUuid('missing')).resolves.toBeNull();
    expect(findOne).toHaveBeenCalledWith({
      where: { uuid: 'missing' },
      relations: { roles: { abilities: true } },
    });
  });

  describe('locked lookups', () => {
    function buildLockingRepository(row: UserOrmEntity | null): {
      repository: Repository<UserOrmEntity>;
      calls: string[];
      where: jest.Mock;
      setLock: jest.Mock;
      findOne: jest.Mock;
    } {
      const calls: string[] = [];
      const where = jest.fn();

      const setLock = jest.fn();

      const lockQb = {
        select: jest.fn().mockReturnThis(),
        where: where.mockReturnThis(),
        setLock: setLock.mockReturnThis(),
        getOne: jest.fn().mockImplementation(() => {
          calls.push('lock');
          return Promise.resolve(row ? { id: row.id } : null);
        }),
      };

      const findOne = jest.fn().mockImplementation(() => {
        calls.push('load');
        return Promise.resolve(row);
      });

      const repository = {
        createQueryBuilder: jest.fn().mockReturnValue(lockQb),
        findOne,
        find: jest.fn().mockResolvedValue([]),
      } as unknown as Repository<UserOrmEntity>;

      return { repository, calls, where, setLock, findOne };
    }

    it('findByIdForUpdate takes a pessimistic write lock on the row before loading it', async () => {
      const { repository, calls, where, setLock, findOne } =
        buildLockingRepository(buildOrmUser());

      const result = await new TypeOrmUserRepository(
        repository,
      ).findByIdForUpdate(1);

      expect(where).toHaveBeenCalledWith('user.id = :value', { value: 1 });
      expect(setLock).toHaveBeenCalledWith('for_no_key_update');
      expect(calls).toEqual(['lock', 'load']);
      expect(findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
      expect(result?.email).toBe('jane@example.com');
    });

    it('findByUuidForUpdate locks by uuid and returns null for a missing row', async () => {
      const { repository, calls, where, setLock } =
        buildLockingRepository(null);

      const result = await new TypeOrmUserRepository(
        repository,
      ).findByUuidForUpdate('user-uuid');

      expect(where).toHaveBeenCalledWith('user.uuid = :value', {
        value: 'user-uuid',
      });
      expect(setLock).toHaveBeenCalledWith('for_no_key_update');
      expect(calls).toEqual(['lock', 'load']);
      expect(result).toBeNull();
    });
  });

  describe('findAuthSubject', () => {
    function buildAuthSubjectQueryBuilderMock(row: UserOrmEntity | null) {
      const leftJoin = jest.fn();
      const select = jest.fn();
      const where = jest.fn();
      const getOne = jest.fn().mockResolvedValue(row);

      const qb = {
        leftJoin: leftJoin.mockReturnThis(),
        select: select.mockReturnThis(),
        where: where.mockReturnThis(),
        getOne,
      } as unknown as SelectQueryBuilder<ObjectLiteral>;

      const createQueryBuilder = jest.fn().mockReturnValue(qb);
      const find = jest.fn();

      const repository = {
        createQueryBuilder,
        find,
      } as unknown as Repository<UserOrmEntity>;

      return { repository, leftJoin, select, where, find };
    }

    it('selects only the auth columns and role names, without joining abilities', async () => {
      const { repository, leftJoin, select, where } =
        buildAuthSubjectQueryBuilderMock(null);

      const adapter = new TypeOrmUserRepository(repository);

      await adapter.findAuthSubject('user-uuid');

      expect(leftJoin).toHaveBeenCalledTimes(1);
      expect(leftJoin).toHaveBeenCalledWith('user.roles', 'role');
      expect(select).toHaveBeenCalledWith([
        'user.id',
        'user.uuid',
        'user.status',
        'user.name',
        'user.email',
        'user.emailConfirmedAt',
        'role.id',
        'role.name',
      ]);
      expect(where).toHaveBeenCalledWith('user.uuid = :uuid', {
        uuid: 'user-uuid',
      });
    });

    it('returns null when no row matches', async () => {
      const { repository } = buildAuthSubjectQueryBuilderMock(null);
      const adapter = new TypeOrmUserRepository(repository);

      await expect(adapter.findAuthSubject('missing')).resolves.toBeNull();
    });

    it('maps the row into an AuthSubject without querying actor names', async () => {
      const orm = buildOrmUserWithActors(7, 8);
      orm.emailConfirmedAt = new Date('2026-01-01T00:00:00.000Z');
      const role = new RoleOrmEntity();
      role.id = 3;
      role.name = RoleEnum.ADMIN;
      orm.roles = [role];

      const { repository, find } = buildAuthSubjectQueryBuilderMock(orm);
      const adapter = new TypeOrmUserRepository(repository);

      const result = await adapter.findAuthSubject('user-uuid');

      expect(result).toEqual({
        id: 1,
        uuid: 'user-uuid',
        status: RecordStatus.ACTIVE,
        name: 'Jane Doe',
        email: 'jane@example.com',
        emailConfirmedAt: new Date('2026-01-01T00:00:00.000Z'),
        roleNames: [RoleEnum.ADMIN],
      });
      expect(find).not.toHaveBeenCalled();
    });
  });

  it('findById returns null when no row matches', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const repository = { findOne } as unknown as Repository<UserOrmEntity>;
    const adapter = new TypeOrmUserRepository(repository);

    await expect(adapter.findById(999)).resolves.toBeNull();
    expect(findOne).toHaveBeenCalledWith({
      where: { id: 999 },
      relations: { roles: { abilities: true } },
    });
  });

  it('findById returns the mapped user when found', async () => {
    const findOne = jest.fn().mockResolvedValue(buildOrmUser());
    const repository = { findOne } as unknown as Repository<UserOrmEntity>;
    const adapter = new TypeOrmUserRepository(repository);

    const result = await adapter.findById(1);

    expect(result).toBeInstanceOf(UserEntity);
    expect(result?.uuid).toBe('user-uuid');
  });

  it('findByEmail returns the mapped user when found', async () => {
    const findOne = jest.fn().mockResolvedValue(buildOrmUser());
    const repository = { findOne } as unknown as Repository<UserOrmEntity>;
    const adapter = new TypeOrmUserRepository(repository);

    const result = await adapter.findByEmail('jane@example.com');

    expect(findOne).toHaveBeenCalledWith({
      where: { email: 'jane@example.com' },
      relations: { roles: { abilities: true } },
    });
    expect(result?.email).toBe('jane@example.com');
  });

  it('create saves the mapped user and reloads it with the roles relation', async () => {
    const savedOrm = buildOrmUser();
    const save = jest.fn().mockResolvedValue(savedOrm);
    const findOneOrFail = jest.fn().mockResolvedValue(buildOrmUser());

    const repository = {
      save,
      findOneOrFail,
    } as unknown as Repository<UserOrmEntity>;

    const adapter = new TypeOrmUserRepository(repository);

    const result = await adapter.create(buildDomainUser());

    expect(save).toHaveBeenCalledTimes(1);
    expect(findOneOrFail).toHaveBeenCalledWith({
      where: { id: savedOrm.id },
      relations: { roles: { abilities: true } },
    });
    expect(result).toBeInstanceOf(UserEntity);
  });

  it('update saves the mapped user and reloads it with the roles relation', async () => {
    const savedOrm = buildOrmUser();
    const save = jest.fn().mockResolvedValue(savedOrm);
    const findOneOrFail = jest.fn().mockResolvedValue(buildOrmUser());

    const repository = {
      save,
      findOneOrFail,
    } as unknown as Repository<UserOrmEntity>;

    const adapter = new TypeOrmUserRepository(repository);

    const result = await adapter.update(buildDomainUser());

    expect(save).toHaveBeenCalledTimes(1);
    expect(result).toBeInstanceOf(UserEntity);
  });

  describe.each(['create', 'update'] as const)(
    '%s unique-violation mapping',
    (method) => {
      it('throws EmailAlreadyInUseError when the save hits the active-email unique index', async () => {
        const save = jest
          .fn()
          .mockRejectedValue(buildUniqueViolation('uq_users_email_active'));

        const findOneOrFail = jest.fn();

        const repository = {
          save,
          findOneOrFail,
        } as unknown as Repository<UserOrmEntity>;

        const adapter = new TypeOrmUserRepository(repository);

        await expect(adapter[method](buildDomainUser())).rejects.toBeInstanceOf(
          EmailAlreadyInUseError,
        );
        expect(findOneOrFail).not.toHaveBeenCalled();
      });

      it('rethrows a unique violation on any other constraint unchanged', async () => {
        const violation = buildUniqueViolation('UQ_users_uuid');
        const save = jest.fn().mockRejectedValue(violation);
        const repository = { save } as unknown as Repository<UserOrmEntity>;
        const adapter = new TypeOrmUserRepository(repository);

        await expect(adapter[method](buildDomainUser())).rejects.toBe(
          violation,
        );
      });
    },
  );

  it('softDelete persists the mapped (soft-deleted) user', async () => {
    const save = jest.fn().mockResolvedValue(buildOrmUser());
    const repository = { save } as unknown as Repository<UserOrmEntity>;
    const adapter = new TypeOrmUserRepository(repository);

    const deletedUser = buildDomainUser().markDeleted(101);

    await adapter.softDelete(deletedUser);

    expect(save).toHaveBeenCalledTimes(1);

    const [savedRow] = save.mock.calls[0] as [UserOrmEntity];

    // Soft-delete and activation are independent, so status is unchanged.
    expect(savedRow.status).toBe(RecordStatus.ACTIVE);
    expect(savedRow.deletedAt).toBeInstanceOf(Date);
  });

  describe('actor name hydration', () => {
    it('findAllPaginated queries actor names with a deduped In(...) of the row actor ids, select and withDeleted', async () => {
      const rows = [buildOrmUserWithActors(101, 102)];
      const { qb } = buildQueryBuilderMock(rows, 1);
      const createQueryBuilder = jest.fn().mockReturnValue(qb);

      const find = jest
        .fn()
        .mockResolvedValue([
          buildActorRow(101, 'Creator Name'),
          buildActorRow(102, 'Updater Name'),
        ]);

      const repository = {
        createQueryBuilder,
        find,
      } as unknown as Repository<UserOrmEntity>;

      const adapter = new TypeOrmUserRepository(repository);

      const result = await adapter.findAllPaginated(0, 20);

      expect(find).toHaveBeenCalledTimes(1);

      const [findArgs] = find.mock.calls[0] as [
        {
          where: { id: FindOperator<number[]> };
          select: unknown;
          withDeleted: boolean;
        },
      ];

      expect(findArgs.select).toEqual({ id: true, name: true });
      expect(findArgs.withDeleted).toBe(true);
      expect(findArgs.where.id.type).toBe('in');
      expect([...findArgs.where.id.value].sort()).toEqual([101, 102]);

      expect(result.items[0].creatorName).toBe('Creator Name');
      expect(result.items[0].updaterName).toBe('Updater Name');
    });

    it('findAllPaginated does not query actor names when every row has null createdBy/updatedBy (zero-query short circuit)', async () => {
      const { qb } = buildQueryBuilderMock([buildOrmUser()], 1);
      const createQueryBuilder = jest.fn().mockReturnValue(qb);
      const find = jest.fn().mockResolvedValue([]);

      const repository = {
        createQueryBuilder,
        find,
      } as unknown as Repository<UserOrmEntity>;

      const adapter = new TypeOrmUserRepository(repository);

      await adapter.findAllPaginated(0, 20);

      expect(find).not.toHaveBeenCalled();
    });

    it('findByUuid resolves creatorName/updaterName from the matching actor rows', async () => {
      const findOne = jest
        .fn()
        .mockResolvedValue(buildOrmUserWithActors(101, 102));

      const find = jest
        .fn()
        .mockResolvedValue([
          buildActorRow(101, 'Creator Name'),
          buildActorRow(102, 'Updater Name'),
        ]);

      const repository = {
        findOne,
        find,
      } as unknown as Repository<UserOrmEntity>;

      const adapter = new TypeOrmUserRepository(repository);

      const result = await adapter.findByUuid('user-uuid');

      expect(find).toHaveBeenCalledTimes(1);
      expect(result?.creatorName).toBe('Creator Name');
      expect(result?.updaterName).toBe('Updater Name');
    });

    it('create resolves creatorName/updaterName from the reloaded row via the actor lookup', async () => {
      const savedOrm = buildOrmUserWithActors(101, 101);
      const save = jest.fn().mockResolvedValue(savedOrm);

      const findOneOrFail = jest
        .fn()
        .mockResolvedValue(buildOrmUserWithActors(101, 101));

      const find = jest
        .fn()
        .mockResolvedValue([buildActorRow(101, 'Creator Name')]);

      const repository = {
        save,
        findOneOrFail,
        find,
      } as unknown as Repository<UserOrmEntity>;

      const adapter = new TypeOrmUserRepository(repository);

      const result = await adapter.create(buildDomainUser());

      expect(find).toHaveBeenCalledTimes(1);
      expect(result.creatorName).toBe('Creator Name');
      expect(result.updaterName).toBe('Creator Name');
    });

    it('update resolves creatorName/updaterName from the reloaded row via the actor lookup', async () => {
      const savedOrm = buildOrmUserWithActors(101, 102);
      const save = jest.fn().mockResolvedValue(savedOrm);

      const findOneOrFail = jest
        .fn()
        .mockResolvedValue(buildOrmUserWithActors(101, 102));

      const find = jest
        .fn()
        .mockResolvedValue([
          buildActorRow(101, 'Creator Name'),
          buildActorRow(102, 'Updater Name'),
        ]);

      const repository = {
        save,
        findOneOrFail,
        find,
      } as unknown as Repository<UserOrmEntity>;

      const adapter = new TypeOrmUserRepository(repository);

      const result = await adapter.update(buildDomainUser());

      expect(find).toHaveBeenCalledTimes(1);
      expect(result.creatorName).toBe('Creator Name');
      expect(result.updaterName).toBe('Updater Name');
    });

    it('findByEmail never triggers the actor-lookup query', async () => {
      const findOne = jest
        .fn()
        .mockResolvedValue(buildOrmUserWithActors(101, 102));

      const find = jest.fn().mockResolvedValue([]);

      const repository = {
        findOne,
        find,
      } as unknown as Repository<UserOrmEntity>;

      const adapter = new TypeOrmUserRepository(repository);

      const result = await adapter.findByEmail('jane@example.com');

      expect(find).not.toHaveBeenCalled();
      expect(result?.creatorName).toBeNull();
      expect(result?.updaterName).toBeNull();
    });
  });
});
