import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { EMAIL_OUTBOX_PORT } from '@shared/application/ports';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { RoleEntity } from '@modules/authorization/domain/entities/role.entity';
import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import { ROLE_REPOSITORY } from '@modules/authorization/domain/repositories/role.repository';
import { AbilityOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/ability.orm-entity';
import { RoleOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/role.orm-entity';
import { TypeOrmRoleRepository } from '@modules/authorization/infrastructure/persistence/repositories/typeorm-role.repository';
import { RefreshTokenSessionRevoker } from '@modules/auth/application/services/refresh-token-session-revoker';
import { REFRESH_TOKEN_REPOSITORY } from '@modules/auth/domain/repositories/refresh-token.repository';
import { RefreshTokenOrmEntity } from '@modules/auth/infrastructure/persistence/entities/refresh-token.orm-entity';
import { TypeOrmRefreshTokenRepository } from '@modules/auth/infrastructure/persistence/repositories/typeorm-refresh-token.repository';
import { UserChangeRequestEntity } from '../../../domain/entities/user-change-request.entity';
import { UserChangeRequestStatus } from '../../../domain/enums/user-change-request-status.enum';
import { EMAIL_CONFIRMATION_TOKEN_REPOSITORY } from '../../../domain/repositories/email-confirmation-token.repository';
import { USER_CHANGE_REQUEST_REPOSITORY } from '../../../domain/repositories/user-change-request.repository';
import { USER_REPOSITORY } from '../../../domain/repositories/user.repository';
import { UserChangeRequestOrmEntity } from '../../../infrastructure/persistence/entities/user-change-request.orm-entity';
import { UserOrmEntity } from '../../../infrastructure/persistence/entities/user.orm-entity';
import { TypeOrmUserChangeRequestRepository } from '../../../infrastructure/persistence/repositories/typeorm-user-change-request.repository';
import { TypeOrmUserRepository } from '../../../infrastructure/persistence/repositories/typeorm-user.repository';
import { EMAIL_CHANGE_TOKEN_REVOKERS } from '../../ports/email-change-token-revoker.port';
import { PASSWORD_HASHER } from '../../ports/password-hasher.port';
import { USER_SESSION_REVOKERS } from '../../ports/user-session-revoker.port';
import { UserProfileChangeService } from '../../services/user-profile-change.service';
import { UserSessionRevokers } from '../../services/user-session-revokers';
import { ApproveUserChangeRequestUseCase } from '../approve-user-change-request.use-case';
import { DeleteUserUseCase } from '../delete-user.use-case';
import { UpdateOwnProfileUseCase } from '../update-own-profile.use-case';
import { UpdateUserStatusUseCase } from '../update-user-status.use-case';
import { UpdateUserUseCase } from '../update-user.use-case';

// Wires the users registry to the real auth revoker against Postgres, so a
// refresh token that survives deactivation, deletion, or a self-applied
// profile change, or a revocation that escapes the rollback, shows up in live
// rows.
describe('User session revocation (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let updateStatus: UpdateUserStatusUseCase;
  let deleteUser: DeleteUserUseCase;
  let updateUser: UpdateUserUseCase;
  let updateOwnProfile: UpdateOwnProfileUseCase;
  let approveChange: ApproveUserChangeRequestUseCase;
  let changeRequests: TypeOrmUserChangeRequestRepository;
  let refreshTokens: TypeOrmRefreshTokenRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([
          UserOrmEntity,
          RoleOrmEntity,
          AbilityOrmEntity,
          RefreshTokenOrmEntity,
          UserChangeRequestOrmEntity,
        ]),
      ],
      providers: [
        UpdateUserStatusUseCase,
        DeleteUserUseCase,
        UpdateUserUseCase,
        UpdateOwnProfileUseCase,
        ApproveUserChangeRequestUseCase,
        UserProfileChangeService,
        RefreshTokenSessionRevoker,
        TypeOrmRefreshTokenRepository,
        TypeOrmUserChangeRequestRepository,
        { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
        { provide: ROLE_REPOSITORY, useClass: TypeOrmRoleRepository },
        {
          provide: USER_CHANGE_REQUEST_REPOSITORY,
          useExisting: TypeOrmUserChangeRequestRepository,
        },
        // Profile changes in these tests keep the email, so the
        // email-change collaborators are never reached.
        { provide: EMAIL_OUTBOX_PORT, useValue: {} },
        { provide: EMAIL_CONFIRMATION_TOKEN_REPOSITORY, useValue: {} },
        { provide: EMAIL_CHANGE_TOKEN_REVOKERS, useValue: {} },
        { provide: PASSWORD_HASHER, useValue: {} },
        {
          provide: REFRESH_TOKEN_REPOSITORY,
          useExisting: TypeOrmRefreshTokenRepository,
        },
        { provide: USER_SESSION_REVOKERS, useClass: UserSessionRevokers },
      ],
    }).compile();

    // Runs `onModuleInit`, which registers the refresh-token revoker.
    await moduleRef.init();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    updateStatus = moduleRef.get(UpdateUserStatusUseCase);
    deleteUser = moduleRef.get(DeleteUserUseCase);
    updateUser = moduleRef.get(UpdateUserUseCase);
    updateOwnProfile = moduleRef.get(UpdateOwnProfileUseCase);
    approveChange = moduleRef.get(ApproveUserChangeRequestUseCase);
    changeRequests = moduleRef.get(TypeOrmUserChangeRequestRepository);
    refreshTokens = moduleRef.get(TypeOrmRefreshTokenRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await dataSource.query(
      'TRUNCATE TABLE "user_change_requests", "refresh_tokens", "users", "roles" RESTART IDENTITY CASCADE',
    );
  });

  async function insertAdminRole(): Promise<RoleEntity> {
    const repo = dataSource.getRepository(RoleOrmEntity);
    const row = await repo.save(repo.create({ name: RoleEnum.ADMIN }));

    return RoleEntity.reconstitute({
      id: row.id,
      uuid: row.uuid,
      status: row.status,
      name: row.name,
      abilities: [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    });
  }

  async function insertUser(roles: RoleEntity[] = []): Promise<{
    id: number;
    uuid: string;
    email: string;
  }> {
    const repo = dataSource.getRepository(UserOrmEntity);

    const saved = await repo.save(
      repo.create({
        name: 'Jane Doe',
        email: `${randomUUID()}@example.com`,
        password: 'hash',
        emailConfirmedAt: new Date(),
        roles: roles.map(({ id }) => ({ id })),
      }),
    );

    return { id: saved.id, uuid: saved.uuid, email: saved.email };
  }

  async function openRenameRequest(
    user: { id: number; email: string },
    roles: RoleEntity[] = [],
  ): Promise<string> {
    const requester = await insertUser();

    const request = await changeRequests.create(
      UserChangeRequestEntity.open({
        uuid: randomUUID(),
        targetUserId: user.id,
        requestedBy: requester.id,
        current: { name: 'Jane Doe', email: user.email, roles },
        requested: { name: 'Jane Renamed', email: user.email, roles },
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );

    return request.uuid;
  }

  async function findUserName(id: number): Promise<string> {
    const rows: Array<{ name: string }> = await dataSource.query(
      'SELECT name FROM "users" WHERE id = $1',
      [id],
    );

    return rows[0].name;
  }

  async function insertRefreshTokens(userId: number, count = 2): Promise<void> {
    const repo = dataSource.getRepository(RefreshTokenOrmEntity);

    for (let index = 0; index < count; index++) {
      await repo.save(
        repo.create({
          userId,
          sessionId: randomUUID(),
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
        }),
      );
    }
  }

  async function countActiveRefreshTokens(userId: number): Promise<number> {
    const rows: Array<{ count: number }> = await dataSource.query(
      'SELECT count(*)::int AS count FROM "refresh_tokens" WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    );

    return rows[0].count;
  }

  async function findUserRow(
    id: number,
  ): Promise<{ status: RecordStatus; deleted_at: Date | null }> {
    const rows: Array<{ status: RecordStatus; deleted_at: Date | null }> =
      await dataSource.query(
        'SELECT status, deleted_at FROM "users" WHERE id = $1',
        [id],
      );

    return rows[0];
  }

  it('revokes every refresh token of a deactivated user, and reactivation does not restore them', async () => {
    const user = await insertUser();
    const other = await insertUser();
    await insertRefreshTokens(user.id);
    await insertRefreshTokens(other.id);

    await updateStatus.execute({
      uuid: user.uuid,
      status: RecordStatus.INACTIVE,
      actorId: null,
    });

    await expect(countActiveRefreshTokens(user.id)).resolves.toBe(0);
    await expect(countActiveRefreshTokens(other.id)).resolves.toBe(2);

    await updateStatus.execute({
      uuid: user.uuid,
      status: RecordStatus.ACTIVE,
      actorId: null,
    });

    await expect(countActiveRefreshTokens(user.id)).resolves.toBe(0);
  });

  it('leaves refresh tokens untouched when a user is set ACTIVE', async () => {
    const user = await insertUser();
    await insertRefreshTokens(user.id);

    await updateStatus.execute({
      uuid: user.uuid,
      status: RecordStatus.ACTIVE,
      actorId: null,
    });

    await expect(countActiveRefreshTokens(user.id)).resolves.toBe(2);
  });

  it('revokes every refresh token of a soft-deleted user', async () => {
    const user = await insertUser();
    await insertRefreshTokens(user.id);

    await deleteUser.execute({ uuid: user.uuid, actorId: null });

    await expect(countActiveRefreshTokens(user.id)).resolves.toBe(0);
  });

  it.each([
    {
      operation: 'deactivation',
      run: (uuid: string) =>
        updateStatus.execute({
          uuid,
          status: RecordStatus.INACTIVE,
          actorId: null,
        }),
    },
    {
      operation: 'deletion',
      run: (uuid: string) => deleteUser.execute({ uuid, actorId: null }),
    },
  ])(
    'rolls the $operation back when the revocation fails, leaving the user and its tokens untouched',
    async ({ run }) => {
      const user = await insertUser();
      await insertRefreshTokens(user.id);

      jest
        .spyOn(refreshTokens, 'revokeAllForUser')
        .mockRejectedValueOnce(new Error('boom'));

      await expect(run(user.uuid)).rejects.toThrow('boom');

      await expect(findUserRow(user.id)).resolves.toEqual({
        status: RecordStatus.ACTIVE,
        deleted_at: null,
      });
      await expect(countActiveRefreshTokens(user.id)).resolves.toBe(2);
    },
  );

  it('revokes every refresh token of a user who updates their own profile, and only theirs', async () => {
    const user = await insertUser();
    const other = await insertUser();
    await insertRefreshTokens(user.id);
    await insertRefreshTokens(other.id);

    await updateUser.execute({
      uuid: user.uuid,
      name: 'Jane Renamed',
      actorId: user.id,
    });

    await expect(countActiveRefreshTokens(user.id)).resolves.toBe(0);
    await expect(countActiveRefreshTokens(other.id)).resolves.toBe(2);
  });

  it.each([
    { scenario: 'another user', actor: 'other' as const },
    { scenario: 'the system', actor: null },
  ])(
    'leaves refresh tokens untouched when $scenario updates the profile',
    async ({ actor }) => {
      const user = await insertUser();
      const other = await insertUser();
      await insertRefreshTokens(user.id);

      await updateUser.execute({
        uuid: user.uuid,
        name: 'Jane Renamed',
        actorId: actor === null ? null : other.id,
      });

      await expect(countActiveRefreshTokens(user.id)).resolves.toBe(2);
    },
  );

  it('revokes every refresh token of a user who updates their profile through the self-service route, and only theirs', async () => {
    const user = await insertUser();
    const other = await insertUser();
    await insertRefreshTokens(user.id);
    await insertRefreshTokens(other.id);

    await updateOwnProfile.execute({ actorId: user.id, name: 'Jane Renamed' });

    await expect(findUserName(user.id)).resolves.toBe('Jane Renamed');
    await expect(countActiveRefreshTokens(user.id)).resolves.toBe(0);
    await expect(countActiveRefreshTokens(other.id)).resolves.toBe(2);
  });

  it('revokes every refresh token on an empty self-service update', async () => {
    const user = await insertUser();
    await insertRefreshTokens(user.id);

    await updateOwnProfile.execute({ actorId: user.id });

    await expect(countActiveRefreshTokens(user.id)).resolves.toBe(0);
  });

  it('rolls a self-service update back when the revocation fails, leaving the profile and its tokens untouched', async () => {
    const user = await insertUser();
    await insertRefreshTokens(user.id);

    jest
      .spyOn(refreshTokens, 'revokeAllForUser')
      .mockRejectedValueOnce(new Error('boom'));

    await expect(
      updateOwnProfile.execute({ actorId: user.id, name: 'Jane Renamed' }),
    ).rejects.toThrow('boom');

    await expect(findUserName(user.id)).resolves.toBe('Jane Doe');
    await expect(countActiveRefreshTokens(user.id)).resolves.toBe(2);
  });

  it('revokes every refresh token of a user who approves a change to their own profile', async () => {
    const adminRole = await insertAdminRole();
    const user = await insertUser([adminRole]);
    await insertRefreshTokens(user.id);
    const requestUuid = await openRenameRequest(user, [adminRole]);

    await approveChange.execute({ uuid: requestUuid, actorId: user.id });

    await expect(findUserName(user.id)).resolves.toBe('Jane Renamed');
    await expect(countActiveRefreshTokens(user.id)).resolves.toBe(0);
  });

  it('rolls a self-update back when the revocation fails, leaving the profile and its tokens untouched', async () => {
    const user = await insertUser();
    await insertRefreshTokens(user.id);

    jest
      .spyOn(refreshTokens, 'revokeAllForUser')
      .mockRejectedValueOnce(new Error('boom'));

    await expect(
      updateUser.execute({
        uuid: user.uuid,
        name: 'Jane Renamed',
        actorId: user.id,
      }),
    ).rejects.toThrow('boom');

    await expect(findUserName(user.id)).resolves.toBe('Jane Doe');
    await expect(countActiveRefreshTokens(user.id)).resolves.toBe(2);
  });

  it('rolls an approval back when the revocation fails, leaving the request pending', async () => {
    const adminRole = await insertAdminRole();
    const user = await insertUser([adminRole]);
    await insertRefreshTokens(user.id);
    const requestUuid = await openRenameRequest(user, [adminRole]);

    jest
      .spyOn(refreshTokens, 'revokeAllForUser')
      .mockRejectedValueOnce(new Error('boom'));

    await expect(
      approveChange.execute({ uuid: requestUuid, actorId: user.id }),
    ).rejects.toThrow('boom');

    await expect(findUserName(user.id)).resolves.toBe('Jane Doe');
    await expect(countActiveRefreshTokens(user.id)).resolves.toBe(2);
    await expect(changeRequests.findByUuid(requestUuid)).resolves.toEqual(
      expect.objectContaining({ status: UserChangeRequestStatus.PENDING }),
    );
  });
});
