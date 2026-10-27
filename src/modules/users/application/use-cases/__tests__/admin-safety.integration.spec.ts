import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import { RoleEntity } from '@modules/authorization/domain/entities/role.entity';
import { RoleOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/role.orm-entity';
import { AbilityOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/ability.orm-entity';
import { TypeOrmRoleRepository } from '@modules/authorization/infrastructure/persistence/repositories/typeorm-role.repository';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { UserEntity } from '../../../domain/entities/user.entity';
import { AdminChangeApprovalRequiredError } from '../../../domain/errors/admin-change-approval-required.error';
import { AdminRoleGrantForbiddenError } from '../../../domain/errors/admin-role-grant-forbidden.error';
import { AdminRoleRemovalForbiddenError } from '../../../domain/errors/admin-role-removal-forbidden.error';
import { AdminTargetForbiddenError } from '../../../domain/errors/admin-target-forbidden.error';
import { SelfDeactivationForbiddenError } from '../../../domain/errors/self-deactivation-forbidden.error';
import { SelfDeletionForbiddenError } from '../../../domain/errors/self-deletion-forbidden.error';
import { UserChangeRequestOrmEntity } from '../../../infrastructure/persistence/entities/user-change-request.orm-entity';
import { UserOrmEntity } from '../../../infrastructure/persistence/entities/user.orm-entity';
import { TypeOrmUserChangeRequestRepository } from '../../../infrastructure/persistence/repositories/typeorm-user-change-request.repository';
import { TypeOrmUserRepository } from '../../../infrastructure/persistence/repositories/typeorm-user.repository';
import { UserProfileChangeService } from '../../services/user-profile-change.service';
import { CreateUserUseCase } from '../create-user.use-case';
import { DeleteUserUseCase } from '../delete-user.use-case';
import { UpdateUserStatusUseCase } from '../update-user-status.use-case';
import { UpdateUserUseCase } from '../update-user.use-case';

describe('admin safety use cases (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let users: TypeOrmUserRepository;
  let roles: TypeOrmRoleRepository;
  let transactions: TransactionManagerPort;
  let createUser: CreateUserUseCase;
  let updateUser: UpdateUserUseCase;
  let updateStatus: UpdateUserStatusUseCase;
  let deleteUser: DeleteUserUseCase;

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
    roles = moduleRef.get(TypeOrmRoleRepository);
    transactions = moduleRef.get(TRANSACTION_MANAGER);

    const emailOutbox = {
      schedule: jest
        .fn()
        .mockResolvedValue({ scheduled: false, reason: 'EXHAUSTED' }),
    };

    createUser = new CreateUserUseCase(
      users,
      roles,
      {
        hash: () => Promise.resolve('hash'),
        verify: () => Promise.resolve(true),
      },
      emailOutbox,
      transactions,
    );
    updateUser = new UpdateUserUseCase(
      users,
      roles,
      moduleRef.get(TypeOrmUserChangeRequestRepository),
      transactions,
      new UserProfileChangeService(
        users,
        emailOutbox,
        { consumeAllForUser: () => Promise.resolve() } as never,
        { revokeAllForUser: () => Promise.resolve() } as never,
        { revokeAllForUser: () => Promise.resolve() } as never,
      ),
    );
    updateStatus = new UpdateUserStatusUseCase(
      users,
      moduleRef.get(TypeOrmUserChangeRequestRepository),
      transactions,
      { revokeAllForUser: () => Promise.resolve() } as never,
    );
    deleteUser = new DeleteUserUseCase(
      users,
      moduleRef.get(TypeOrmUserChangeRequestRepository),
      transactions,
      { revokeAllForUser: () => Promise.resolve() } as never,
    );
  });

  afterAll(async () => {
    await moduleRef.close();
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

  async function addUser(email: string, role: RoleEntity): Promise<UserEntity> {
    return users.create(
      UserEntity.create({
        uuid: randomUUID(),
        name: email,
        email,
        password: 'hash',
        roles: [role],
        createdBy: null,
      }),
    );
  }

  it('rejects ADMIN assignment by a non-admin on both create and update', async () => {
    const adminRole = await addRole(RoleEnum.ADMIN);
    const userRole = await addRole(RoleEnum.USER);
    const actor = await addUser('actor@example.com', userRole);
    const target = await addUser('target@example.com', userRole);

    await expect(
      createUser.execute({
        name: 'New Admin',
        email: 'new@example.com',
        password: 'password',
        roleUuids: [adminRole.uuid],
        actorId: actor.id,
      }),
    ).rejects.toThrow(AdminRoleGrantForbiddenError);
    await expect(
      updateUser.execute({
        uuid: target.uuid,
        name: target.name,
        email: target.email,
        roleUuids: [adminRole.uuid],
        actorId: actor.id,
      }),
    ).rejects.toThrow(AdminRoleGrantForbiddenError);
    expect(await users.findByEmail('new@example.com')).toBeNull();
    expect((await users.findByUuid(target.uuid))?.roles[0].name).toBe(
      RoleEnum.USER,
    );
  });

  it('allows an existing active admin to grant ADMIN', async () => {
    const adminRole = await addRole(RoleEnum.ADMIN);
    const actor = await addUser('admin@example.com', adminRole);

    const created = await createUser.execute({
      name: 'Second Admin',
      email: 'second@example.com',
      password: 'password',
      roleUuids: [adminRole.uuid],
      actorId: actor.id,
    });

    expect(created.roles[0].name).toBe(RoleEnum.ADMIN);
  });

  it('forbids self deactivation and deletion, including for a non-admin', async () => {
    const userRole = await addRole(RoleEnum.USER);
    const target = await addUser('target@example.com', userRole);

    await expect(
      updateStatus.execute({
        uuid: target.uuid,
        status: RecordStatus.INACTIVE,
        actorId: target.id,
      }),
    ).rejects.toThrow(SelfDeactivationForbiddenError);
    await expect(
      deleteUser.execute({ uuid: target.uuid, actorId: target.id }),
    ).rejects.toThrow(SelfDeletionForbiddenError);
    expect((await users.findByUuid(target.uuid))?.status).toBe(
      RecordStatus.ACTIVE,
    );
  });

  it('keeps the last active admin: only another active admin may act on an admin, never on themselves', async () => {
    const adminRole = await addRole(RoleEnum.ADMIN);
    const userRole = await addRole(RoleEnum.USER);
    const admin = await addUser('admin@example.com', adminRole);
    const manager = await addUser('manager@example.com', userRole);

    for (const actorId of [manager.id, null]) {
      await expect(
        updateStatus.execute({
          uuid: admin.uuid,
          status: RecordStatus.INACTIVE,
          actorId,
        }),
      ).rejects.toThrow(AdminTargetForbiddenError);
      await expect(
        deleteUser.execute({ uuid: admin.uuid, actorId }),
      ).rejects.toThrow(AdminTargetForbiddenError);
      await expect(
        updateUser.execute({
          uuid: admin.uuid,
          name: admin.name,
          email: admin.email,
          roleUuids: [adminRole.uuid],
          actorId,
        }),
      ).rejects.toThrow(AdminTargetForbiddenError);
    }

    await expect(
      updateStatus.execute({
        uuid: admin.uuid,
        status: RecordStatus.INACTIVE,
        actorId: admin.id,
      }),
    ).rejects.toThrow(SelfDeactivationForbiddenError);
    await expect(
      deleteUser.execute({ uuid: admin.uuid, actorId: admin.id }),
    ).rejects.toThrow(SelfDeletionForbiddenError);
    await expect(
      updateUser.execute({
        uuid: admin.uuid,
        name: admin.name,
        email: admin.email,
        roleUuids: [userRole.uuid],
        actorId: admin.id,
      }),
    ).rejects.toThrow(AdminRoleRemovalForbiddenError);
    expect(await users.countActiveAdmins()).toBe(1);
  });

  it('applies an admin self-edit but sends edits to another admin through approval', async () => {
    const adminRole = await addRole(RoleEnum.ADMIN);
    const userRole = await addRole(RoleEnum.USER);
    const first = await addUser('first@example.com', adminRole);
    const second = await addUser('second@example.com', adminRole);

    await expect(
      updateUser.execute({
        uuid: second.uuid,
        name: 'Renamed by first',
        email: second.email,
        roleUuids: [adminRole.uuid],
        actorId: first.id,
      }),
    ).rejects.toThrow(AdminChangeApprovalRequiredError);

    const updated = await updateUser.execute({
      uuid: first.uuid,
      name: 'Renamed by self',
      email: first.email,
      roleUuids: [adminRole.uuid, userRole.uuid],
      actorId: first.id,
    });

    expect(updated.name).toBe('Renamed by self');
    expect(updated.roles.map((role) => role.name).sort()).toEqual([
      RoleEnum.ADMIN,
      RoleEnum.USER,
    ]);
    expect((await users.findByUuid(second.uuid))?.name).toBe(second.name);
  });

  it('allows an admin to remove another of two admins while preserving themselves', async () => {
    const adminRole = await addRole(RoleEnum.ADMIN);
    const first = await addUser('first@example.com', adminRole);
    const second = await addUser('second@example.com', adminRole);

    await updateStatus.execute({
      uuid: first.uuid,
      status: RecordStatus.INACTIVE,
      actorId: second.id,
    });
    expect(await users.countActiveAdmins()).toBe(1);
  });

  it('does not let an inactive or deleted admin act on another admin', async () => {
    const adminRole = await addRole(RoleEnum.ADMIN);
    const first = await addUser('first@example.com', adminRole);
    const inactive = await addUser('inactive@example.com', adminRole);
    const deleted = await addUser('deleted@example.com', adminRole);

    await users.update(inactive.withStatus(RecordStatus.INACTIVE, null));
    await users.softDelete(deleted.markDeleted(null));

    expect(await users.countActiveAdmins()).toBe(1);
    for (const actor of [inactive, deleted]) {
      await expect(
        updateStatus.execute({
          uuid: first.uuid,
          status: RecordStatus.INACTIVE,
          actorId: actor.id,
        }),
      ).rejects.toThrow(AdminTargetForbiddenError);
    }
  });

  it('serializes concurrent removals so one active admin remains', async () => {
    const adminRole = await addRole(RoleEnum.ADMIN);
    const first = await addUser('first@example.com', adminRole);
    const second = await addUser('second@example.com', adminRole);

    const results = await Promise.allSettled([
      updateStatus.execute({
        uuid: first.uuid,
        status: RecordStatus.INACTIVE,
        actorId: second.id,
      }),
      deleteUser.execute({ uuid: second.uuid, actorId: first.id }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(await users.countActiveAdmins()).toBe(1);
  });
});
