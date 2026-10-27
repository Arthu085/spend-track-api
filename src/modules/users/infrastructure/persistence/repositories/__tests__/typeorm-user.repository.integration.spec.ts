import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { Action } from '@shared/domain/enums/action.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { Subject } from '@shared/domain/authorization/subject';
import { RoleEntity } from '@modules/authorization/domain/entities/role.entity';
import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import { AbilityOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/ability.orm-entity';
import { RoleOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/role.orm-entity';
import { UserEntity } from '../../../../domain/entities/user.entity';
import { EmailAlreadyInUseError } from '../../../../domain/errors/email-already-in-use.error';
import { UserListResponseDto } from '../../../../presentation/dto/output/user-list.response';
import { UserOrmEntity } from '../../entities/user.orm-entity';
import { TypeOrmUserRepository } from '../typeorm-user.repository';

describe('TypeOrmUserRepository (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let repository: TypeOrmUserRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([
          UserOrmEntity,
          RoleOrmEntity,
          AbilityOrmEntity,
        ]),
      ],
      providers: [TypeOrmUserRepository],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    repository = moduleRef.get(TypeOrmUserRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "users", "roles", "abilities" RESTART IDENTITY CASCADE',
    );
  });

  async function insertRole(name: RoleEnum) {
    const roleRepo = dataSource.getRepository(RoleOrmEntity);
    return roleRepo.save(roleRepo.create({ name }));
  }

  async function insertRoleWithAbility(
    name: RoleEnum,
    action: Action,
    subject: Subject,
  ) {
    const abilityRepo = dataSource.getRepository(AbilityOrmEntity);

    const ability = await abilityRepo.save(
      abilityRepo.create({ action, subject }),
    );

    const roleRepo = dataSource.getRepository(RoleOrmEntity);
    return roleRepo.save(roleRepo.create({ name, abilities: [ability] }));
  }

  function buildNewUser(
    email: string,
    roles: Array<ReturnType<typeof buildRoleEntityStub>>,
  ): UserEntity {
    return UserEntity.create({
      uuid: randomUUID(),
      name: 'Jane Doe',
      email,
      password: 'hashed-password',
      roles,
      createdBy: null,
    });
  }

  function buildNewNamedUser(name: string, email: string): UserEntity {
    return UserEntity.create({
      uuid: randomUUID(),
      name,
      email,
      password: 'hashed-password',
      roles: [],
      createdBy: null,
    });
  }

  function buildRoleEntityStub(roleRow: RoleOrmEntity): RoleEntity {
    // A minimal-but-real RoleEntity: RoleMapper.toOrm reads `abilities`, so a
    // bare `{ id, uuid }` object (missing that field) breaks the mapper.
    return RoleEntity.reconstitute({
      id: roleRow.id,
      uuid: roleRow.uuid,
      status: RecordStatus.ACTIVE,
      name: roleRow.name,
      abilities: [],
      createdAt: roleRow.createdAt,
      updatedAt: roleRow.updatedAt,
      deletedAt: roleRow.deletedAt,
    });
  }

  async function captureQueries(run: () => Promise<unknown>) {
    const spy = jest.spyOn(PostgresQueryRunner.prototype, 'query');

    try {
      await run();
      return spy.mock.calls.map(([sql]) => sql);
    } finally {
      spy.mockRestore();
    }
  }

  it('creates a user, persisting the N:N roles relation (user_roles)', async () => {
    const roleRow = await insertRole(RoleEnum.USER);

    const user = buildNewUser('jane@example.com', [
      buildRoleEntityStub(roleRow),
    ]);

    const created = await repository.create(user);

    expect(created.email).toBe('jane@example.com');
    expect(created.roles).toHaveLength(1);
    expect(created.roles[0].uuid).toBe(roleRow.uuid);

    const found = await repository.findByUuid(created.uuid);
    expect(found?.roles).toHaveLength(1);
    expect(found?.roles[0].name).toBe(RoleEnum.USER);
  });

  it('creates a user with updatedAt equal to createdAt, both taken from the database clock', async () => {
    const user = buildNewUser('jane@example.com', []);

    // Lets the domain entity's in-memory timestamps drift from the insert time.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const created = await repository.create(user);

    expect(created.updatedAt.getTime()).toBe(created.createdAt.getTime());
  });

  it('findByUuid hydrates the nested roles.abilities relation, not just roles', async () => {
    const roleRow = await insertRoleWithAbility(
      RoleEnum.USER,
      Action.READ,
      Subject.USER,
    );

    const user = buildNewUser('jane@example.com', [
      buildRoleEntityStub(roleRow),
    ]);

    const created = await repository.create(user);

    const found = await repository.findByUuid(created.uuid);
    expect(found?.roles).toHaveLength(1);
    expect(found?.roles[0].abilities).toHaveLength(1);
    expect(found?.roles[0].abilities[0].action).toBe(Action.READ);
    expect(found?.roles[0].abilities[0].subject).toBe(Subject.USER);
  });

  it('findAllPaginated hydrates roles without joining their abilities', async () => {
    const roleRow = await insertRoleWithAbility(
      RoleEnum.USER,
      Action.READ,
      Subject.USER,
    );

    await repository.create(
      buildNewUser('jane@example.com', [buildRoleEntityStub(roleRow)]),
    );

    const queries = await captureQueries(() =>
      repository.findAllPaginated(0, 20),
    );

    const result = await repository.findAllPaginated(0, 20);

    expect(queries.some((sql) => /abilities/.test(sql))).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].roles).toHaveLength(1);
    expect(result.items[0].roles[0].uuid).toBe(roleRow.uuid);
    expect(result.items[0].roles[0].name).toBe(RoleEnum.USER);
    expect(result.items[0].roles[0].abilities).toEqual([]);
  });

  it('findAllPaginated yields the same UserListResponseDto as a fully hydrated read', async () => {
    const translate = (key: string) => key;

    const adminRole = await insertRoleWithAbility(
      RoleEnum.ADMIN,
      Action.UPDATE,
      Subject.USER,
    );

    const userRole = await insertRoleWithAbility(
      RoleEnum.USER,
      Action.READ,
      Subject.USER,
    );

    const created = await repository.create(
      buildNewUser('jane@example.com', [
        buildRoleEntityStub(adminRole),
        buildRoleEntityStub(userRole),
      ]),
    );

    const result = await repository.findAllPaginated(0, 20);
    const hydrated = await repository.findByUuid(created.uuid);

    expect(hydrated?.roles.every((role) => role.abilities.length === 1)).toBe(
      true,
    );

    const byRole = (a: { role: string }, b: { role: string }) =>
      a.role.localeCompare(b.role);

    const listed = UserListResponseDto.fromDomain(result.items[0], translate);

    const expected = UserListResponseDto.fromDomain(
      hydrated as UserEntity,
      translate,
    );

    expect({ ...listed, roles: [...listed.roles].sort(byRole) }).toEqual({
      ...expected,
      roles: [...expected.roles].sort(byRole),
    });
  });

  it('finds a user by email', async () => {
    const user = buildNewUser('jane@example.com', []);
    await repository.create(user);

    const found = await repository.findByEmail('jane@example.com');
    expect(found?.email).toBe('jane@example.com');

    expect(await repository.findByEmail('missing@example.com')).toBeNull();
  });

  describe('active-email unique index', () => {
    it('maps a second user with the same email to EmailAlreadyInUseError', async () => {
      await repository.create(buildNewUser('jane@example.com', []));

      await expect(
        repository.create(buildNewUser('jane@example.com', [])),
      ).rejects.toBeInstanceOf(EmailAlreadyInUseError);
    });

    // Both inserts race past any application-level lookup; Postgres blocks
    // the loser on the unique index until the winner commits, then 23505.
    it('lets exactly one of two concurrent creates with the same email win', async () => {
      const results = await Promise.allSettled([
        repository.create(buildNewNamedUser('First', 'race@example.com')),
        repository.create(buildNewNamedUser('Second', 'race@example.com')),
      ]);

      const fulfilled = results.filter(
        (result) => result.status === 'fulfilled',
      );

      const rejected = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(EmailAlreadyInUseError);

      const rows: Array<{ count: string }> = await dataSource.query(
        `SELECT COUNT(*) AS count FROM "users" WHERE "email" = 'race@example.com'`,
      );

      expect(Number(rows[0].count)).toBe(1);
    });

    it('maps an update onto another live user email to EmailAlreadyInUseError and keeps the row unchanged', async () => {
      await repository.create(buildNewUser('taken@example.com', []));

      const user = await repository.create(
        buildNewUser('jane@example.com', []),
      );

      await expect(
        repository.update(
          user.withProfile({
            name: user.name,
            email: 'taken@example.com',
            roles: [],
            actorId: null,
          }),
        ),
      ).rejects.toBeInstanceOf(EmailAlreadyInUseError);

      const reloaded = await repository.findByUuid(user.uuid);
      expect(reloaded?.email).toBe('jane@example.com');
    });

    it('lets exactly one of two concurrent updates onto the same free email win', async () => {
      const first = await repository.create(
        buildNewNamedUser('First', 'first@example.com'),
      );

      const second = await repository.create(
        buildNewNamedUser('Second', 'second@example.com'),
      );

      const moveTo = (user: UserEntity) =>
        repository.update(
          user.withProfile({
            name: user.name,
            email: 'contested@example.com',
            roles: [],
            actorId: null,
          }),
        );

      const results = await Promise.allSettled([moveTo(first), moveTo(second)]);

      const rejected = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );

      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(EmailAlreadyInUseError);
    });

    it('does not map a unique violation on another column (uuid) to EmailAlreadyInUseError', async () => {
      const existing = await repository.create(
        buildNewUser('jane@example.com', []),
      );

      const duplicateUuid = UserEntity.create({
        uuid: existing.uuid,
        name: 'John Doe',
        email: 'john@example.com',
        password: 'hashed-password',
        roles: [],
        createdBy: null,
      });

      const error: unknown = await repository
        .create(duplicateUuid)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(QueryFailedError);
      expect(error).not.toBeInstanceOf(EmailAlreadyInUseError);
      expect((error as QueryFailedError).driverError).toMatchObject({
        code: '23505',
      });
    });
  });

  it('findAllPaginated respects offset/limit and returns the total count', async () => {
    await repository.create(buildNewUser('user1@example.com', []));
    await repository.create(buildNewUser('user2@example.com', []));
    await repository.create(buildNewUser('user3@example.com', []));

    const page1 = await repository.findAllPaginated(0, 2);
    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);

    const page2 = await repository.findAllPaginated(2, 2);
    expect(page2.total).toBe(3);
    expect(page2.items).toHaveLength(1);
  });

  it('findAllPaginated filters by a case-insensitive partial name match', async () => {
    const alice = await repository.create(
      buildNewNamedUser('Alice', 'alice@example.com'),
    );

    const alicia = await repository.create(
      buildNewNamedUser('alicia', 'alicia@example.com'),
    );

    await repository.create(buildNewNamedUser('Bob', 'bob@example.com'));

    const result = await repository.findAllPaginated(0, 20, { name: 'ali' });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items.map((user) => user.uuid).sort()).toEqual(
      [alice.uuid, alicia.uuid].sort(),
    );
    expect(result.items.every((user) => user.name !== 'Bob')).toBe(true);
  });

  it('findAllPaginated filters by a case-insensitive partial email match', async () => {
    const alice = await repository.create(
      buildNewNamedUser('Alice', 'alice-mail@example.com'),
    );

    const alicia = await repository.create(
      buildNewNamedUser('Alicia', 'alicia-mail@example.com'),
    );

    await repository.create(buildNewNamedUser('Bob', 'bob-mail@example.com'));

    const result = await repository.findAllPaginated(0, 20, {
      email: 'ALI',
    });

    expect(result.total).toBe(2);
    expect(result.items.map((user) => user.uuid).sort()).toEqual(
      [alice.uuid, alicia.uuid].sort(),
    );
  });

  it('findAllPaginated filters by an exact status match', async () => {
    const active = await repository.create(
      buildNewNamedUser('Active User', 'active@example.com'),
    );

    const inactiveUser = await repository.create(
      buildNewNamedUser('Inactive User', 'inactive@example.com'),
    );

    const deactivated = inactiveUser.withStatus(RecordStatus.INACTIVE, null);
    await repository.update(deactivated);

    const activeResult = await repository.findAllPaginated(0, 20, {
      status: RecordStatus.ACTIVE,
    });

    expect(activeResult.items.map((user) => user.uuid)).toContain(active.uuid);
    expect(activeResult.items.map((user) => user.uuid)).not.toContain(
      deactivated.uuid,
    );

    const inactiveResult = await repository.findAllPaginated(0, 20, {
      status: RecordStatus.INACTIVE,
    });

    expect(inactiveResult.total).toBe(1);
    expect(inactiveResult.items[0].uuid).toBe(deactivated.uuid);
  });

  it('findAllPaginated returns users of every status when no status filter is given (defaulting to ACTIVE is a use-case responsibility, not the repository)', async () => {
    const active = await repository.create(
      buildNewNamedUser('Any Status Active', 'any-status-active@example.com'),
    );

    const inactiveUser = await repository.create(
      buildNewNamedUser(
        'Any Status Inactive',
        'any-status-inactive@example.com',
      ),
    );

    const deactivated = inactiveUser.withStatus(RecordStatus.INACTIVE, null);
    await repository.update(deactivated);

    const result = await repository.findAllPaginated(0, 20);

    expect(result.items.map((user) => user.uuid)).toEqual(
      expect.arrayContaining([active.uuid, deactivated.uuid]),
    );
  });

  it('findAllPaginated filters by role uuid and still hydrates ALL roles of a multi-role user', async () => {
    const adminRole = await insertRole(RoleEnum.ADMIN);
    const userRole = await insertRole(RoleEnum.USER);

    const multiRoleUser = await repository.create(
      buildNewUser('multi-role@example.com', [
        buildRoleEntityStub(adminRole),
        buildRoleEntityStub(userRole),
      ]),
    );

    const singleRoleUser = await repository.create(
      buildNewUser('single-role@example.com', [buildRoleEntityStub(userRole)]),
    );

    const result = await repository.findAllPaginated(0, 20, {
      role: adminRole.uuid,
    });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].uuid).toBe(multiRoleUser.uuid);
    expect(result.items.map((user) => user.uuid)).not.toContain(
      singleRoleUser.uuid,
    );

    // A user matched by one role still hydrates all of their roles.
    const roleNames = result.items[0].roles.map((role) => role.name).sort();
    expect(roleNames).toEqual([RoleEnum.ADMIN, RoleEnum.USER].sort());
  });

  it('findAllPaginated combines name, status and role filters with AND semantics', async () => {
    const adminRole = await insertRole(RoleEnum.ADMIN);
    const userRole = await insertRole(RoleEnum.USER);

    const match = await repository.create(
      buildNewUser('combo-match@example.com', [buildRoleEntityStub(adminRole)]),
    );

    // Same name pattern, but wrong role -> excluded.
    await repository.create(
      buildNewUser('combo-wrong-role@example.com', [
        buildRoleEntityStub(userRole),
      ]),
    );

    // Same name + role, but deactivated -> excluded.
    const wrongStatusUser = await repository.create(
      buildNewUser('combo-wrong-status@example.com', [
        buildRoleEntityStub(adminRole),
      ]),
    );

    await repository.update(
      wrongStatusUser.withStatus(RecordStatus.INACTIVE, null),
    );

    const result = await repository.findAllPaginated(0, 20, {
      email: 'combo-',
      status: RecordStatus.ACTIVE,
      role: adminRole.uuid,
    });

    expect(result.total).toBe(1);
    expect(result.items[0].uuid).toBe(match.uuid);
  });

  it('findAllPaginated reflects the filtered count (not the full table) under pagination', async () => {
    await repository.create(
      buildNewNamedUser('Match One', 'match1@example.com'),
    );
    await repository.create(
      buildNewNamedUser('Match Two', 'match2@example.com'),
    );
    await repository.create(buildNewNamedUser('Other', 'other@example.com'));

    const page1 = await repository.findAllPaginated(0, 1, { name: 'Match' });
    expect(page1.total).toBe(2);
    expect(page1.items).toHaveLength(1);

    const page2 = await repository.findAllPaginated(1, 1, { name: 'Match' });
    expect(page2.total).toBe(2);
    expect(page2.items).toHaveLength(1);
  });

  it('update replaces profile fields and the roles (N:N) relation', async () => {
    const roleA = await insertRole(RoleEnum.ADMIN);
    const roleB = await insertRole(RoleEnum.USER);

    const created = await repository.create(
      buildNewUser('jane@example.com', [buildRoleEntityStub(roleA)]),
    );

    const updated = created.withProfile({
      name: 'Jane Updated',
      email: 'jane.updated@example.com',
      roles: [buildRoleEntityStub(roleB)],
      actorId: created.id,
    });

    const result = await repository.update(updated);

    expect(result.name).toBe('Jane Updated');
    expect(result.email).toBe('jane.updated@example.com');
    expect(result.roles).toHaveLength(1);
    expect(result.roles[0].uuid).toBe(roleB.uuid);

    const reloaded = await repository.findByUuid(created.uuid);
    expect(reloaded?.roles).toHaveLength(1);
    expect(reloaded?.roles[0].uuid).toBe(roleB.uuid);
  });

  it('update advances updated_at/updated_by even when only the roles relation changes (regression)', async () => {
    const roleA = await insertRole(RoleEnum.ADMIN);
    const roleB = await insertRole(RoleEnum.USER);

    const created = await repository.create(
      buildNewUser('jane@example.com', [buildRoleEntityStub(roleA)]),
    );

    const beforeRows: Array<{ updated_at: Date }> = await dataSource.query(
      'SELECT updated_at FROM "users" WHERE uuid = $1',
      [created.uuid],
    );

    const updatedAtBefore = beforeRows[0].updated_at;

    // Avoid a same-millisecond timestamp flake between create() and update().
    await new Promise((r) => setTimeout(r, 5));

    const updated = created.withProfile({
      name: created.name,
      email: created.email,
      roles: [buildRoleEntityStub(roleB)],
      actorId: null,
    });

    const result = await repository.update(updated);

    const afterRows: Array<{ updated_at: Date }> = await dataSource.query(
      'SELECT updated_at FROM "users" WHERE uuid = $1',
      [created.uuid],
    );

    const updatedAtAfter = afterRows[0].updated_at;

    expect(new Date(updatedAtAfter).getTime()).toBeGreaterThan(
      new Date(updatedAtBefore).getTime(),
    );
    expect(result.updatedAt.getTime()).toBeGreaterThan(
      created.updatedAt.getTime(),
    );
    expect(result.roles).toHaveLength(1);
    expect(result.roles[0].uuid).toBe(roleB.uuid);
  });

  it('softDelete marks the user deleted (without changing status) and excludes it from normal reads', async () => {
    const created = await repository.create(
      buildNewUser('jane@example.com', []),
    );

    const actor = await repository.create(
      buildNewUser('actor@example.com', []),
    );

    const deleted = created.markDeleted(actor.id);
    await repository.softDelete(deleted);

    expect(await repository.findByUuid(created.uuid)).toBeNull();

    const rows: Array<{
      status: string;
      deleted_at: Date | null;
      deleted_by: number | null;
    }> = await dataSource.query(
      'SELECT status, deleted_at, deleted_by FROM "users" WHERE uuid = $1',
      [created.uuid],
    );

    expect(rows).toHaveLength(1);
    // Soft-delete and activation are independent, so status stays ACTIVE.
    expect(rows[0].status).toBe(RecordStatus.ACTIVE);
    expect(rows[0].deleted_at).not.toBeNull();
    expect(rows[0].deleted_by).toBe(actor.id);
  });

  it('allows a new user to reuse the email of a soft-deleted user (regression)', async () => {
    const original = await repository.create(
      buildNewUser('jane@example.com', []),
    );

    await repository.softDelete(original.markDeleted(null));

    const recreated = await repository.create(
      buildNewUser('jane@example.com', []),
    );

    expect(recreated.email).toBe('jane@example.com');
    expect(recreated.id).not.toBe(original.id);
    expect(recreated.uuid).not.toBe(original.uuid);
  });

  it('still rejects a duplicate email for a still-live user, regardless of ACTIVE/INACTIVE status', async () => {
    const activeUser = await repository.create(
      buildNewUser('jane@example.com', []),
    );

    await expect(
      repository.create(buildNewUser('jane@example.com', [])),
    ).rejects.toBeInstanceOf(EmailAlreadyInUseError);

    await repository.update(activeUser.withStatus(RecordStatus.INACTIVE, null));

    await expect(
      repository.create(buildNewUser('jane@example.com', [])),
    ).rejects.toBeInstanceOf(EmailAlreadyInUseError);
  });

  describe('actor name hydration (creatorName/updaterName)', () => {
    function buildAuthoredUser(
      name: string,
      email: string,
      createdBy: number | null,
    ): UserEntity {
      return UserEntity.create({
        uuid: randomUUID(),
        name,
        email,
        password: 'hashed-password',
        roles: [],
        createdBy,
      });
    }

    it('resolves creatorName/updaterName from the authoring user referenced by created_by/updated_by', async () => {
      const userA = await repository.create(
        buildAuthoredUser('User A', 'actor-a@example.com', null),
      );

      const userB = await repository.create(
        buildAuthoredUser('User B', 'actor-b@example.com', userA.id),
      );

      const found = await repository.findByUuid(userB.uuid);

      expect(found?.creatorName).toBe('User A');
      expect(found?.updaterName).toBe('User A');
    });

    it('findAllPaginated resolves per-row creatorName/updaterName correctly when the page mixes rows authored by two different users', async () => {
      const authorOne = await repository.create(
        buildAuthoredUser('Author One', 'author-one@example.com', null),
      );

      const authorTwo = await repository.create(
        buildAuthoredUser('Author Two', 'author-two@example.com', null),
      );

      const childOfOne = await repository.create(
        buildAuthoredUser(
          'Child Of One',
          'child-one@example.com',
          authorOne.id,
        ),
      );

      const childOfTwo = await repository.create(
        buildAuthoredUser(
          'Child Of Two',
          'child-two@example.com',
          authorTwo.id,
        ),
      );

      const result = await repository.findAllPaginated(0, 20);

      const foundChildOfOne = result.items.find(
        (user) => user.uuid === childOfOne.uuid,
      );

      const foundChildOfTwo = result.items.find(
        (user) => user.uuid === childOfTwo.uuid,
      );

      expect(foundChildOfOne?.creatorName).toBe('Author One');
      expect(foundChildOfTwo?.creatorName).toBe('Author Two');
    });

    it('resolves creatorName/updaterName to null when created_by/updated_by are null (seeded/bootstrap case)', async () => {
      const bootstrapUser = await repository.create(
        buildAuthoredUser('Bootstrap User', 'bootstrap@example.com', null),
      );

      const found = await repository.findByUuid(bootstrapUser.uuid);

      expect(found?.creatorName).toBeNull();
      expect(found?.updaterName).toBeNull();
    });

    it('rejects an actor id with no matching user row (foreign key)', async () => {
      await expect(
        repository.create(
          buildAuthoredUser('Orphan User', 'orphan@example.com', 999999),
        ),
      ).rejects.toThrow(QueryFailedError);
    });

    it('sets the actor columns to null when the referenced user row is hard-deleted', async () => {
      const author = await repository.create(
        buildAuthoredUser(
          'Hard Deleted Author',
          'hard-deleted@example.com',
          null,
        ),
      );

      const child = await repository.create(
        buildAuthoredUser(
          'Orphaned Child',
          'orphaned-child@example.com',
          author.id,
        ),
      );

      await dataSource.query('DELETE FROM "users" WHERE id = $1', [author.id]);

      const found = await repository.findByUuid(child.uuid);

      expect(found?.createdBy).toBeNull();
      expect(found?.updatedBy).toBeNull();
      expect(found?.creatorName).toBeNull();
    });

    it('resolves creatorName from a soft-deleted author (withDeleted honored), while the listing still excludes that author', async () => {
      const author = await repository.create(
        buildAuthoredUser(
          'Soon Deleted Author',
          'soon-deleted-author@example.com',
          null,
        ),
      );

      const child = await repository.create(
        buildAuthoredUser(
          'Author Child',
          'author-child@example.com',
          author.id,
        ),
      );

      await repository.softDelete(author.markDeleted(null));

      const found = await repository.findByUuid(child.uuid);
      expect(found?.creatorName).toBe('Soon Deleted Author');
      expect(found?.updaterName).toBe('Soon Deleted Author');

      const listing = await repository.findAllPaginated(0, 20);
      expect(listing.items.map((user) => user.uuid)).not.toContain(author.uuid);
      expect(listing.items.map((user) => user.uuid)).toContain(child.uuid);
    });
  });

  describe('findAuthSubject', () => {
    async function createAuthoredUserWithAbilityRole() {
      const roleRow = await insertRoleWithAbility(
        RoleEnum.USER,
        Action.READ,
        Subject.USER,
      );

      const author = await repository.create(
        buildNewUser('author@example.com', []),
      );

      return repository.create(
        UserEntity.create({
          uuid: randomUUID(),
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'hashed-password',
          roles: [buildRoleEntityStub(roleRow)],
          createdBy: author.id,
        }),
      );
    }

    it('returns the auth fields and role names of the matching user', async () => {
      const created = await createAuthoredUserWithAbilityRole();
      const confirmedAt = new Date();
      await repository.update(created.withEmailConfirmed(confirmedAt));

      const subject = await repository.findAuthSubject(created.uuid);

      expect(subject).toEqual({
        id: created.id,
        uuid: created.uuid,
        status: RecordStatus.ACTIVE,
        name: 'Jane Doe',
        email: 'jane@example.com',
        emailConfirmedAt: confirmedAt,
        roleNames: [RoleEnum.USER],
      });
    });

    it('returns null for an unknown uuid and for a soft-deleted user', async () => {
      const created = await repository.create(
        buildNewUser('deleted@example.com', []),
      );

      await repository.softDelete(created.markDeleted(null));

      await expect(
        repository.findAuthSubject(randomUUID()),
      ).resolves.toBeNull();
      await expect(
        repository.findAuthSubject(created.uuid),
      ).resolves.toBeNull();
    });

    it('returns an INACTIVE user with a null emailConfirmedAt and no roles, leaving the decision to the caller', async () => {
      const created = await repository.create(
        buildNewUser('inactive@example.com', []),
      );

      await dataSource.query('UPDATE "users" SET status = $1 WHERE id = $2', [
        RecordStatus.INACTIVE,
        created.id,
      ]);

      const subject = await repository.findAuthSubject(created.uuid);

      expect(subject?.status).toBe(RecordStatus.INACTIVE);
      expect(subject?.emailConfirmedAt).toBeNull();
      expect(subject?.roleNames).toEqual([]);
    });

    it('resolves the same role names as findByUuid, including inactive roles and excluding soft-deleted ones', async () => {
      const adminRole = await insertRole(RoleEnum.ADMIN);
      const userRole = await insertRole(RoleEnum.USER);

      const created = await repository.create(
        buildNewUser('multi-role@example.com', [
          buildRoleEntityStub(adminRole),
          buildRoleEntityStub(userRole),
        ]),
      );

      await dataSource.query('UPDATE "roles" SET status = $1 WHERE id = $2', [
        RecordStatus.INACTIVE,
        adminRole.id,
      ]);

      const withInactiveRole = await repository.findAuthSubject(created.uuid);
      const fullWithInactiveRole = await repository.findByUuid(created.uuid);

      expect([...(withInactiveRole?.roleNames ?? [])].sort()).toEqual(
        [RoleEnum.ADMIN, RoleEnum.USER].sort(),
      );
      expect([...(withInactiveRole?.roleNames ?? [])].sort()).toEqual(
        fullWithInactiveRole?.roles.map((role) => role.name).sort(),
      );

      await dataSource.getRepository(RoleOrmEntity).softDelete(adminRole.id);

      const withDeletedRole = await repository.findAuthSubject(created.uuid);
      const fullWithDeletedRole = await repository.findByUuid(created.uuid);

      expect(withDeletedRole?.roleNames).toEqual([RoleEnum.USER]);
      expect(withDeletedRole?.roleNames).toEqual(
        fullWithDeletedRole?.roles.map((role) => role.name),
      );
    });

    it('issues a single query that skips abilities, actor names and the password hash, unlike findByUuid', async () => {
      const created = await createAuthoredUserWithAbilityRole();

      const leanQueries = await captureQueries(() =>
        repository.findAuthSubject(created.uuid),
      );

      const fullQueries = await captureQueries(() =>
        repository.findByUuid(created.uuid),
      );

      expect(leanQueries).toHaveLength(1);
      expect(leanQueries[0]).not.toMatch(/abilities/);
      expect(leanQueries[0]).not.toMatch(/password/);

      expect(fullQueries.length).toBeGreaterThan(leanQueries.length);
      expect(fullQueries.some((sql) => /abilities/.test(sql))).toBe(true);
    });
  });

  describe('emailConfirmedAt and findById', () => {
    it('a newly created user has a null emailConfirmedAt', async () => {
      const created = await repository.create(
        buildNewUser('unconfirmed@example.com', []),
      );

      expect(created.emailConfirmedAt).toBeNull();

      const found = await repository.findByUuid(created.uuid);
      expect(found?.emailConfirmedAt).toBeNull();
    });

    it('round-trips a confirmed emailConfirmedAt through update/findByUuid/findByEmail', async () => {
      const created = await repository.create(
        buildNewUser('confirm-roundtrip@example.com', []),
      );

      const confirmedAt = new Date();
      const confirmed = created.withEmailConfirmed(confirmedAt);
      await repository.update(confirmed);

      const foundByUuid = await repository.findByUuid(created.uuid);
      expect(foundByUuid?.emailConfirmedAt).not.toBeNull();
      expect(foundByUuid?.emailConfirmedAt?.getTime()).toBe(
        confirmedAt.getTime(),
      );

      const foundByEmail = await repository.findByEmail(
        'confirm-roundtrip@example.com',
      );

      expect(foundByEmail?.emailConfirmedAt).not.toBeNull();
    });

    it('findById resolves a user by their numeric id, hydrating roles', async () => {
      const roleRow = await insertRole(RoleEnum.USER);

      const created = await repository.create(
        buildNewUser('find-by-id@example.com', [buildRoleEntityStub(roleRow)]),
      );

      const found = await repository.findById(created.id);

      expect(found?.uuid).toBe(created.uuid);
      expect(found?.roles).toHaveLength(1);
    });

    it('findById returns null for an id with no matching row', async () => {
      await expect(repository.findById(999_999)).resolves.toBeNull();
    });

    it('a password update persists through the repository', async () => {
      const created = await repository.create(
        buildNewUser('password-update@example.com', []),
      );

      const updated = created.withPassword('new-hashed-password', null);
      await repository.update(updated);

      const found = await repository.findById(created.id);
      expect(found?.password).toBe('new-hashed-password');
    });
  });
});
