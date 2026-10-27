import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppConfigService, CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import { RoleEntity } from '@modules/authorization/domain/entities/role.entity';
import { RoleOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/role.orm-entity';
import { AbilityOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/ability.orm-entity';
import { TypeOrmRoleRepository } from '@modules/authorization/infrastructure/persistence/repositories/typeorm-role.repository';
import {
  TRANSACTION_MANAGER,
  type EmailOutboxPort,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { UserEntity } from '../../../domain/entities/user.entity';
import { UserChangeRequestEntity } from '../../../domain/entities/user-change-request.entity';
import { UserChangeRequestStatus } from '../../../domain/enums/user-change-request-status.enum';
import { UserChangeRequestNotPendingError } from '../../../domain/errors/user-change-request-not-pending.error';
import { UserChangeRequestStaleError } from '../../../domain/errors/user-change-request-stale.error';
import { UserChangeRequestOrmEntity } from '../../../infrastructure/persistence/entities/user-change-request.orm-entity';
import { UserOrmEntity } from '../../../infrastructure/persistence/entities/user.orm-entity';
import { TypeOrmUserChangeRequestRepository } from '../../../infrastructure/persistence/repositories/typeorm-user-change-request.repository';
import { TypeOrmUserRepository } from '../../../infrastructure/persistence/repositories/typeorm-user.repository';
import { UserProfileChangeService } from '../../services/user-profile-change.service';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { ApproveUserChangeRequestUseCase } from '../approve-user-change-request.use-case';
import { DeleteUserUseCase } from '../delete-user.use-case';
import { ListMyUserChangeRequestsUseCase } from '../list-my-user-change-requests.use-case';
import { RejectUserChangeRequestUseCase } from '../reject-user-change-request.use-case';
import { RequestUserChangeUseCase } from '../request-user-change.use-case';
import { UpdateUserStatusUseCase } from '../update-user-status.use-case';
import { UpdateUserUseCase } from '../update-user.use-case';

describe('admin change requests (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let users: TypeOrmUserRepository;
  let changeRequests: TypeOrmUserChangeRequestRepository;
  let requestChange: RequestUserChangeUseCase;
  let listMine: ListMyUserChangeRequestsUseCase;
  let approve: ApproveUserChangeRequestUseCase;
  let reject: RejectUserChangeRequestUseCase;
  let updateUser: UpdateUserUseCase;
  let updateStatus: UpdateUserStatusUseCase;
  let deleteUser: DeleteUserUseCase;
  let thirdAdmin: UserEntity;

  let adminRole: RoleEntity;
  let userRole: RoleEntity;
  let requester: UserEntity;
  let target: UserEntity;

  const schedule = jest.fn();

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([
          UserOrmEntity,
          RoleOrmEntity,
          AbilityOrmEntity,
          UserChangeRequestOrmEntity,
        ]),
      ],
      providers: [
        TypeOrmUserRepository,
        TypeOrmRoleRepository,
        TypeOrmUserChangeRequestRepository,
      ],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    users = moduleRef.get(TypeOrmUserRepository);
    changeRequests = moduleRef.get(TypeOrmUserChangeRequestRepository);
    const roles = moduleRef.get(TypeOrmRoleRepository);

    const transactions =
      moduleRef.get<TransactionManagerPort>(TRANSACTION_MANAGER);

    const emailOutbox: EmailOutboxPort = { schedule };

    const sessionRevokers = {
      revokeAllForUser: () => Promise.resolve(),
    } as never;

    const profileChange = new UserProfileChangeService(
      users,
      emailOutbox,
      { consumeAllForUser: () => Promise.resolve() } as never,
      { revokeAllForUser: () => Promise.resolve() } as never,
      sessionRevokers,
    );

    requestChange = new RequestUserChangeUseCase(
      users,
      roles,
      changeRequests,
      emailOutbox,
      transactions,
      profileChange,
      moduleRef.get(AppConfigService),
    );
    listMine = new ListMyUserChangeRequestsUseCase(users, changeRequests);
    approve = new ApproveUserChangeRequestUseCase(
      users,
      roles,
      changeRequests,
      transactions,
      profileChange,
    );

    reject = new RejectUserChangeRequestUseCase(
      users,
      changeRequests,
      transactions,
    );
    updateUser = new UpdateUserUseCase(
      users,
      roles,
      changeRequests,
      transactions,
      profileChange,
    );
    updateStatus = new UpdateUserStatusUseCase(
      users,
      changeRequests,
      transactions,
      sessionRevokers,
    );
    deleteUser = new DeleteUserUseCase(
      users,
      changeRequests,
      transactions,
      sessionRevokers,
    );
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    schedule.mockReset().mockResolvedValue({ scheduled: true });
    adminRole = await addRole(RoleEnum.ADMIN);
    userRole = await addRole(RoleEnum.USER);
    requester = await addUser('Requester', 'requester@example.com');
    target = await addUser('Target', 'target@example.com');
    thirdAdmin = await addUser('Third', 'third@example.com');
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "user_change_requests", "users", "roles", "abilities" RESTART IDENTITY CASCADE',
    );
  });

  async function addRole(name: RoleEnum): Promise<RoleEntity> {
    const repo = dataSource.getRepository(RoleOrmEntity);
    const row = await repo.save(repo.create({ name }));

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

  async function addUser(name: string, email: string): Promise<UserEntity> {
    return users.create(
      UserEntity.create({
        uuid: randomUUID(),
        name,
        email,
        password: 'hash',
        roles: [adminRole],
        createdBy: null,
      }),
    );
  }

  function requestRename(name: string): Promise<UserChangeRequestEntity> {
    return requestChange.execute({
      uuid: target.uuid,
      name,
      email: 'target.new@example.com',
      roleUuids: [adminRole.uuid, userRole.uuid],
      actorId: requester.id,
    });
  }

  async function statusOf(uuid: string): Promise<UserChangeRequestStatus> {
    const request = await changeRequests.findByUuid(uuid);

    return request!.status;
  }

  it('stores a pending request with both value sets and leaves the target untouched until approval', async () => {
    const created = await requestRename('Target Renamed');

    const [pending] = await listMine.execute(target.id);

    expect(pending.uuid).toBe(created.uuid);
    expect(pending.requesterName).toBe('Requester');
    expect(pending.current.name).toBe('Target');
    expect(pending.current.email).toBe('target@example.com');
    expect(pending.current.roles.map((role) => role.name)).toEqual([
      RoleEnum.ADMIN,
    ]);
    expect(pending.requested.name).toBe('Target Renamed');
    expect(pending.requested.email).toBe('target.new@example.com');
    expect(pending.requested.roles.map((role) => role.name).sort()).toEqual([
      RoleEnum.ADMIN,
      RoleEnum.USER,
    ]);
    expect((await users.findById(target.id))?.name).toBe('Target');
    expect(await listMine.execute(requester.id)).toEqual([]);
  });

  it('keeps at most one pending request per target: a new one supersedes the old', async () => {
    const first = await requestRename('First');
    const second = await requestRename('Second');

    expect(await statusOf(first.uuid)).toBe(UserChangeRequestStatus.SUPERSEDED);
    expect((await listMine.execute(target.id)).map((r) => r.uuid)).toEqual([
      second.uuid,
    ]);
    await expect(
      approve.execute({ uuid: first.uuid, actorId: target.id }),
    ).rejects.toThrow(UserChangeRequestNotPendingError);
  });

  it('enforces the one-pending-request rule in the database', async () => {
    await requestRename('First');

    await expect(
      changeRequests.create(
        UserChangeRequestEntity.open({
          uuid: randomUUID(),
          targetUserId: target.id,
          requestedBy: requester.id,
          current: { name: 'Target', email: target.email, roles: [] },
          requested: { name: 'Bypass', email: target.email, roles: [] },
          expiresAt: new Date(Date.now() + 60_000),
        }),
      ),
    ).rejects.toThrow(/uq_user_change_requests_pending_target/);
  });

  it('applies the requested values on approval, once', async () => {
    const created = await requestRename('Target Renamed');

    const updated = await approve.execute({
      uuid: created.uuid,
      actorId: target.id,
    });

    expect(updated.name).toBe('Target Renamed');
    expect(updated.email).toBe('target.new@example.com');
    expect(updated.emailConfirmedAt).toBeNull();
    expect(updated.roles.map((role) => role.name).sort()).toEqual([
      RoleEnum.ADMIN,
      RoleEnum.USER,
    ]);
    expect(await statusOf(created.uuid)).toBe(UserChangeRequestStatus.APPROVED);
    await expect(
      approve.execute({ uuid: created.uuid, actorId: target.id }),
    ).rejects.toThrow(UserChangeRequestNotPendingError);
  });

  it('leaves the target untouched on rejection', async () => {
    const created = await requestRename('Target Renamed');

    await reject.execute({ uuid: created.uuid, actorId: target.id });

    expect(await statusOf(created.uuid)).toBe(UserChangeRequestStatus.REJECTED);
    expect((await users.findById(target.id))?.name).toBe('Target');
    expect(await listMine.execute(target.id)).toEqual([]);
  });

  it('cannot be approved after it expires', async () => {
    const created = await requestRename('Target Renamed');
    await dataSource.query(
      `UPDATE "user_change_requests" SET "expires_at" = now() - interval '1 second' WHERE "uuid" = $1`,
      [created.uuid],
    );

    expect(await listMine.execute(target.id)).toEqual([]);
    await expect(
      approve.execute({ uuid: created.uuid, actorId: target.id }),
    ).rejects.toThrow(UserChangeRequestNotPendingError);
  });

  it("is superseded by the target's own edit", async () => {
    const created = await requestRename('Target Renamed');

    await updateUser.execute({
      uuid: target.uuid,
      name: 'Self Edit',
      email: target.email,
      roleUuids: [adminRole.uuid],
      actorId: target.id,
    });

    expect(await statusOf(created.uuid)).toBe(
      UserChangeRequestStatus.SUPERSEDED,
    );
  });

  it('refuses approval when the profile changed outside the request flow', async () => {
    const created = await requestRename('Target Renamed');
    const current = await users.findById(target.id);
    await users.update(
      current!.withProfile({
        name: 'Changed Elsewhere',
        email: current!.email,
        roles: current!.roles,
        actorId: null,
      }),
    );

    await expect(
      approve.execute({ uuid: created.uuid, actorId: target.id }),
    ).rejects.toThrow(UserChangeRequestStaleError);
    expect((await users.findById(target.id))?.name).toBe('Changed Elsewhere');
  });

  it('cannot be approved once its requester is deactivated or deleted', async () => {
    const created = await requestRename('Target Renamed');

    await updateStatus.execute({
      uuid: requester.uuid,
      status: RecordStatus.INACTIVE,
      actorId: thirdAdmin.id,
    });

    expect(await statusOf(created.uuid)).toBe(
      UserChangeRequestStatus.SUPERSEDED,
    );
    await expect(
      approve.execute({ uuid: created.uuid, actorId: target.id }),
    ).rejects.toThrow(UserChangeRequestNotPendingError);

    await updateStatus.execute({
      uuid: requester.uuid,
      status: RecordStatus.ACTIVE,
      actorId: thirdAdmin.id,
    });
    const second = await requestRename('Second Rename');
    await deleteUser.execute({ uuid: requester.uuid, actorId: thirdAdmin.id });

    expect(await statusOf(second.uuid)).toBe(
      UserChangeRequestStatus.SUPERSEDED,
    );
  });

  it('does not survive the target being deactivated and reactivated', async () => {
    const created = await requestRename('Target Renamed');

    await updateStatus.execute({
      uuid: target.uuid,
      status: RecordStatus.INACTIVE,
      actorId: thirdAdmin.id,
    });
    await updateStatus.execute({
      uuid: target.uuid,
      status: RecordStatus.ACTIVE,
      actorId: thirdAdmin.id,
    });

    expect(await statusOf(created.uuid)).toBe(
      UserChangeRequestStatus.SUPERSEDED,
    );
    expect(await listMine.execute(target.id)).toEqual([]);
  });
});
