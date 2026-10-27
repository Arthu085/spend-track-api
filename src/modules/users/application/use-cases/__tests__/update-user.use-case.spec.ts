import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import { Logger } from '@nestjs/common';
import type { RoleEntity } from '@modules/authorization/domain/entities/role.entity';
import type { RoleRepository } from '@modules/authorization/domain/repositories/role.repository';
import { InactiveRoleError } from '@modules/authorization/domain/errors/inactive-role.error';
import { RoleNotFoundError } from '@modules/authorization/domain/errors/role-not-found.error';
import { buildUser } from '@test/support/builders/user.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import {
  EmailSchedulingUnavailableError,
  type EmailOutboxPort,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { AdminChangeApprovalRequiredError } from '../../../domain/errors/admin-change-approval-required.error';
import { AdminRoleRemovalForbiddenError } from '../../../domain/errors/admin-role-removal-forbidden.error';
import { AdminTargetForbiddenError } from '../../../domain/errors/admin-target-forbidden.error';
import { EmailAlreadyInUseError } from '../../../domain/errors/email-already-in-use.error';
import { InactiveUserError } from '../../../domain/errors/inactive-user.error';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import type { UserEntity } from '../../../domain/entities/user.entity';
import type { EmailConfirmationTokenRepository } from '../../../domain/repositories/email-confirmation-token.repository';
import type { UserChangeRequestRepository } from '../../../domain/repositories/user-change-request.repository';
import type { UserRepository } from '../../../domain/repositories/user.repository';
import type { EmailChangeTokenRevokerRegistry } from '../../ports/email-change-token-revoker.port';
import type { UserSessionRevokerRegistry } from '../../ports/user-session-revoker.port';
import { UserProfileChangeService } from '../../services/user-profile-change.service';
import { UpdateUserUseCase } from '../update-user.use-case';

function buildEmailOutbox(overrides: Partial<{ schedule: jest.Mock }> = {}): {
  port: EmailOutboxPort;
  schedule: jest.Mock;
} {
  const schedule =
    overrides.schedule ?? jest.fn().mockResolvedValue({ scheduled: true });

  return { port: { schedule }, schedule };
}

function buildExistingUser(
  email: string,
  status: RecordStatus = RecordStatus.ACTIVE,
): {
  user: UserEntity;
  withProfile: jest.Mock;
} {
  const withProfile = jest.fn().mockImplementation(function (
    this: UserEntity,
    input: unknown,
  ) {
    return { ...this, ...(input as Record<string, unknown>) };
  });

  const user = {
    id: 7,
    uuid: 'user-1',
    email,
    status,
    roles: [],
    withProfile,
  } as unknown as UserEntity;

  return { user, withProfile };
}

function buildRole(
  uuid: string,
  name: RoleEnum = RoleEnum.USER,
  status: RecordStatus = RecordStatus.ACTIVE,
): RoleEntity {
  return { uuid, name, status, deletedAt: null } as RoleEntity;
}

function stubTokenRepository(
  consumeAllForUser: jest.Mock = jest.fn().mockResolvedValue(undefined),
): EmailConfirmationTokenRepository {
  return mockOf<EmailConfirmationTokenRepository>({ consumeAllForUser });
}

function stubRevokers(
  revokeAllForUser: jest.Mock = jest.fn().mockResolvedValue(undefined),
): EmailChangeTokenRevokerRegistry {
  return mockOf<EmailChangeTokenRevokerRegistry>({ revokeAllForUser });
}

function stubSessionRevokers(
  revokeAllForUser: jest.Mock = jest.fn().mockResolvedValue(undefined),
): UserSessionRevokerRegistry {
  return mockOf<UserSessionRevokerRegistry>({ revokeAllForUser });
}

const transactionManager = {
  runInTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
  runInSavepoint: <T>(work: () => Promise<T>): Promise<T> => work(),
};

function buildUseCase(deps: {
  userRepository: UserRepository;
  roleRepository: RoleRepository;
  emailOutbox: EmailOutboxPort;
  transactionManager: TransactionManagerPort;
  tokenRepository: EmailConfirmationTokenRepository;
  revokers: EmailChangeTokenRevokerRegistry;
  sessionRevokers?: UserSessionRevokerRegistry;
  changeRequestRepository?: UserChangeRequestRepository;
}): UpdateUserUseCase {
  return new UpdateUserUseCase(
    deps.userRepository,
    deps.roleRepository,
    deps.changeRequestRepository ??
      mockOf<UserChangeRequestRepository>({
        supersedePendingForUser: jest.fn().mockResolvedValue(undefined),
      }),
    deps.transactionManager,
    new UserProfileChangeService(
      deps.userRepository,
      deps.emailOutbox,
      deps.tokenRepository,
      deps.revokers,
      deps.sessionRevokers ?? stubSessionRevokers(),
    ),
  );
}

describe('UpdateUserUseCase', () => {
  it('updates the profile without checking email uniqueness when the email is unchanged, and schedules no confirmation email', async () => {
    const { user: existingUser, withProfile } =
      buildExistingUser('jane@example.com');

    const findByUuid = jest.fn().mockResolvedValue(existingUser);
    const findByEmail = jest.fn();
    const updatedUser = { uuid: 'user-1' } as UserEntity;
    const update = jest.fn().mockResolvedValue(updatedUser);

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByUuidForUpdate: findByUuid,
      findByEmail,
      update,
    } as unknown as UserRepository;

    const roles = [buildRole('role-1')];
    const findByUuids = jest.fn().mockResolvedValue(roles);
    const roleRepository = { findByUuids } as unknown as RoleRepository;

    const { port: emailOutbox, schedule } = buildEmailOutbox();

    const useCase = buildUseCase({
      userRepository,
      roleRepository,
      emailOutbox,
      transactionManager,
      tokenRepository: stubTokenRepository(),
      revokers: stubRevokers(),
    });

    const result = await useCase.execute({
      uuid: 'user-1',
      name: 'Jane Updated',
      email: 'jane@example.com',
      roleUuids: ['role-1'],
      actorId: 102,
    });

    expect(findByEmail).not.toHaveBeenCalled();
    expect(withProfile).toHaveBeenCalledWith({
      name: 'Jane Updated',
      email: 'jane@example.com',
      roles,
      actorId: 102,
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(schedule).not.toHaveBeenCalled();
    expect(result).toBe(updatedUser);
  });

  it('keeps the current name, email, and roles for omitted fields, without resolving roles or checking email uniqueness', async () => {
    const currentRoles = [buildRole('role-1')];

    const { user: existingUser, withProfile } =
      buildExistingUser('jane@example.com');

    Object.assign(existingUser, { name: 'Jane Doe', roles: currentRoles });

    const findByEmail = jest.fn();
    const findByUuids = jest.fn();

    const userRepository = mockOf<UserRepository>({
      lockAdminRoster: jest.fn().mockResolvedValue(undefined),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByUuidForUpdate: jest.fn().mockResolvedValue(existingUser),
      findByEmail,
      update: jest.fn().mockResolvedValue({ uuid: 'user-1' }),
    });

    const { port: emailOutbox, schedule } = buildEmailOutbox();

    const useCase = buildUseCase({
      userRepository,
      roleRepository: mockOf<RoleRepository>({ findByUuids }),
      emailOutbox,
      transactionManager,
      tokenRepository: stubTokenRepository(),
      revokers: stubRevokers(),
    });

    await useCase.execute({ uuid: 'user-1', actorId: 102 });

    expect(withProfile).toHaveBeenCalledWith({
      name: 'Jane Doe',
      email: 'jane@example.com',
      roles: currentRoles,
      actorId: 102,
    });
    expect(findByUuids).not.toHaveBeenCalled();
    expect(findByEmail).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('forbids a non-admin actor from changing only the email of an admin', async () => {
    const adminRole = buildRole('admin-role', RoleEnum.ADMIN);
    const { user: admin } = buildExistingUser('admin@example.com');

    Object.assign(admin, { deletedAt: null, roles: [adminRole] });

    const update = jest.fn();

    const userRepository = mockOf<UserRepository>({
      lockAdminRoster: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(buildUser({ id: 50 })),
      findByUuidForUpdate: jest.fn().mockResolvedValue(admin),
      update,
    });

    const useCase = buildUseCase({
      userRepository,
      roleRepository: mockOf<RoleRepository>({ findByUuids: jest.fn() }),
      emailOutbox: buildEmailOutbox().port,
      transactionManager,
      tokenRepository: stubTokenRepository(),
      revokers: stubRevokers(),
    });

    await expect(
      useCase.execute({
        uuid: 'user-1',
        email: 'attacker@example.com',
        actorId: 50,
      }),
    ).rejects.toBeInstanceOf(AdminTargetForbiddenError);
    expect(update).not.toHaveBeenCalled();
  });

  it('treats a casing-only email edit as unchanged: stores the normalized email, skips the uniqueness check, and schedules no confirmation', async () => {
    const { user: existingUser, withProfile } =
      buildExistingUser('jane@example.com');

    const findByEmail = jest.fn();

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByUuidForUpdate: jest.fn().mockResolvedValue(existingUser),
      findByEmail,
      update: jest.fn().mockResolvedValue({ uuid: 'user-1' }),
    } as unknown as UserRepository;

    const roleRepository = {
      findByUuids: jest.fn().mockResolvedValue([]),
    } as unknown as RoleRepository;

    const { port: emailOutbox, schedule } = buildEmailOutbox();

    const useCase = buildUseCase({
      userRepository,
      roleRepository,
      emailOutbox,
      transactionManager,
      tokenRepository: stubTokenRepository(),
      revokers: stubRevokers(),
    });

    await useCase.execute({
      uuid: 'user-1',
      name: 'Jane Doe',
      email: '  Jane@Example.COM ',
      roleUuids: [],
      actorId: 102,
    });

    expect(findByEmail).not.toHaveBeenCalled();
    expect(withProfile).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'jane@example.com' }),
    );
    expect(schedule).not.toHaveBeenCalled();
  });

  it('checks email uniqueness, updates, and schedules exactly one confirmation email to the NEW address when the new email is free', async () => {
    const { user: existingUser } = buildExistingUser('jane@example.com');
    const findByUuid = jest.fn().mockResolvedValue(existingUser);
    const findByEmail = jest.fn().mockResolvedValue(null);

    const updatedUser = {
      uuid: 'user-1',
      email: 'jane.new@example.com',
    } as UserEntity;

    const update = jest.fn().mockResolvedValue(updatedUser);

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByUuidForUpdate: findByUuid,
      findByEmail,
      update,
    } as unknown as UserRepository;

    const roleRepository = {
      findByUuids: jest.fn().mockResolvedValue([]),
    } as unknown as RoleRepository;

    const { port: emailOutbox, schedule } = buildEmailOutbox();

    const useCase = buildUseCase({
      userRepository,
      roleRepository,
      emailOutbox,
      transactionManager,
      tokenRepository: stubTokenRepository(),
      revokers: stubRevokers(),
    });

    await useCase.execute({
      uuid: 'user-1',
      name: 'Jane Updated',
      email: 'jane.new@example.com',
      roleUuids: [],
      actorId: null,
    });

    expect(findByEmail).toHaveBeenCalledWith('jane.new@example.com');
    expect(update).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith({
      emailType: EmailType.EMAIL_CONFIRMATION,
      recipient: 'jane.new@example.com',
    });
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('throws EmailAlreadyInUseError when the new email belongs to another user, without scheduling a confirmation', async () => {
    const { user: existingUser } = buildExistingUser('jane@example.com');
    const findByUuid = jest.fn().mockResolvedValue(existingUser);

    const findByEmail = jest.fn().mockResolvedValue({ uuid: 'other-user' });

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByUuidForUpdate: findByUuid,
      findByEmail,
      update: jest.fn(),
    } as unknown as UserRepository;

    const roleRepository = {
      findByUuids: jest.fn().mockResolvedValue([]),
    } as unknown as RoleRepository;

    const useCase = buildUseCase({
      userRepository,
      roleRepository,
      emailOutbox: buildEmailOutbox().port,
      transactionManager,
      tokenRepository: stubTokenRepository(),
      revokers: stubRevokers(),
    });

    await expect(
      useCase.execute({
        uuid: 'user-1',
        name: 'Jane Updated',
        email: 'taken@example.com',
        roleUuids: [],
        actorId: null,
      }),
    ).rejects.toBeInstanceOf(EmailAlreadyInUseError);
  });

  it('throws UserNotFoundError when the user does not exist', async () => {
    const findByUuid = jest.fn().mockResolvedValue(null);

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByUuidForUpdate: findByUuid,
      findByEmail: jest.fn(),
      update: jest.fn(),
    } as unknown as UserRepository;

    const roleRepository = {
      findByUuids: jest.fn(),
    } as unknown as RoleRepository;

    const useCase = buildUseCase({
      userRepository,
      roleRepository,
      emailOutbox: buildEmailOutbox().port,
      transactionManager,
      tokenRepository: stubTokenRepository(),
      revokers: stubRevokers(),
    });

    await expect(
      useCase.execute({
        uuid: 'missing',
        name: 'Jane',
        email: 'jane@example.com',
        roleUuids: [],
        actorId: null,
      }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('throws InactiveUserError when the user is INACTIVE and never touches the repository update path', async () => {
    const { user: existingUser } = buildExistingUser(
      'jane@example.com',
      RecordStatus.INACTIVE,
    );

    const findByUuid = jest.fn().mockResolvedValue(existingUser);
    const findByEmail = jest.fn();
    const update = jest.fn();

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByUuidForUpdate: findByUuid,
      findByEmail,
      update,
    } as unknown as UserRepository;

    const roleRepository = {
      findByUuids: jest.fn(),
    } as unknown as RoleRepository;

    const useCase = buildUseCase({
      userRepository,
      roleRepository,
      emailOutbox: buildEmailOutbox().port,
      transactionManager,
      tokenRepository: stubTokenRepository(),
      revokers: stubRevokers(),
    });

    await expect(
      useCase.execute({
        uuid: 'user-1',
        name: 'Jane Updated',
        email: 'jane@example.com',
        roleUuids: [],
        actorId: null,
      }),
    ).rejects.toBeInstanceOf(InactiveUserError);

    expect(findByEmail).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('a name/roles-only update (email unchanged) schedules no confirmation email', async () => {
    const { user: existingUser } = buildExistingUser('jane@example.com');
    const findByUuid = jest.fn().mockResolvedValue(existingUser);
    const findByEmail = jest.fn();
    const update = jest.fn().mockResolvedValue({ uuid: 'user-1' });

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByUuidForUpdate: findByUuid,
      findByEmail,
      update,
    } as unknown as UserRepository;

    const roleRepository = {
      findByUuids: jest.fn().mockResolvedValue([buildRole('role-1')]),
    } as unknown as RoleRepository;

    const { port: emailOutbox, schedule } = buildEmailOutbox();

    const useCase = buildUseCase({
      userRepository,
      roleRepository,
      emailOutbox,
      transactionManager,
      tokenRepository: stubTokenRepository(),
      revokers: stubRevokers(),
    });

    await useCase.execute({
      uuid: 'user-1',
      name: 'Name Only Change',
      email: 'jane@example.com',
      roleUuids: ['role-1'],
      actorId: 102,
    });

    expect(schedule).not.toHaveBeenCalled();
  });

  it('when the email changes and the send quota denies the confirmation, the update still succeeds and a warning is logged', async () => {
    const { user: existingUser } = buildExistingUser('jane@example.com');
    const findByUuid = jest.fn().mockResolvedValue(existingUser);
    const findByEmail = jest.fn().mockResolvedValue(null);

    const updatedUser = {
      uuid: 'user-1',
      email: 'jane.new@example.com',
    } as UserEntity;

    const update = jest.fn().mockResolvedValue(updatedUser);

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(null),
      findByUuidForUpdate: findByUuid,
      findByEmail,
      update,
    } as unknown as UserRepository;

    const roleRepository = {
      findByUuids: jest.fn().mockResolvedValue([]),
    } as unknown as RoleRepository;

    const { port: emailOutbox } = buildEmailOutbox({
      schedule: jest
        .fn()
        .mockResolvedValue({ scheduled: false, reason: 'EXHAUSTED' }),
    });

    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    const useCase = buildUseCase({
      userRepository,
      roleRepository,
      emailOutbox,
      transactionManager,
      tokenRepository: stubTokenRepository(),
      revokers: stubRevokers(),
    });

    const result = await useCase.execute({
      uuid: 'user-1',
      name: 'Jane Updated',
      email: 'jane.new@example.com',
      roleUuids: [],
      actorId: null,
    });

    expect(result).toBe(updatedUser);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith({
      msg: 'Email confirmation not scheduled',
      userId: updatedUser.uuid,
      reason: 'EXHAUSTED',
    });

    warnSpy.mockRestore();
  });
  describe('admin protection', () => {
    const adminRole = buildRole('admin-role', RoleEnum.ADMIN);
    const userRole = buildRole('user-role', RoleEnum.USER);

    const admin = buildUser({
      id: 7,
      uuid: 'admin-1',
      email: 'admin@example.com',
      roles: [adminRole],
    });

    function buildHarness(
      target: UserEntity,
      actor: UserEntity | null,
      resolvedRoles: RoleEntity[],
    ): {
      useCase: UpdateUserUseCase;
      update: jest.Mock;
      supersedePendingForUser: jest.Mock;
    } {
      const update = jest
        .fn()
        .mockImplementation((user: UserEntity) => Promise.resolve(user));

      const supersedePendingForUser = jest.fn().mockResolvedValue(undefined);

      const useCase = buildUseCase({
        userRepository: mockOf<UserRepository>({
          lockAdminRoster: jest.fn().mockResolvedValue(undefined),
          findByUuidForUpdate: jest.fn().mockResolvedValue(target),
          findById: jest.fn().mockResolvedValue(actor),
          findByEmail: jest.fn().mockResolvedValue(null),
          update,
        }),
        roleRepository: mockOf<RoleRepository>({
          findByUuids: jest.fn().mockResolvedValue(resolvedRoles),
        }),
        emailOutbox: buildEmailOutbox().port,
        transactionManager,
        tokenRepository: stubTokenRepository(),
        revokers: stubRevokers(),
        changeRequestRepository: mockOf<UserChangeRequestRepository>({
          supersedePendingForUser,
        }),
      });

      return { useCase, update, supersedePendingForUser };
    }

    const editAdmin = (actorId: number | null, roleUuids: string[]) => ({
      uuid: admin.uuid,
      name: 'Admin Renamed',
      email: admin.email,
      roleUuids,
      actorId,
    });

    it.each([
      {
        scenario: 'a non-admin actor',
        actor: buildUser({ id: 50, roles: [userRole] }),
      },
      { scenario: 'no actor', actor: null },
      {
        scenario: 'an inactive admin actor',
        actor: buildUser({
          id: 50,
          status: RecordStatus.INACTIVE,
          roles: [adminRole],
        }),
      },
    ])('forbids $scenario from updating an admin', async ({ actor }) => {
      const { useCase, update } = buildHarness(admin, actor, [adminRole]);

      await expect(
        useCase.execute(editAdmin(actor?.id ?? null, [adminRole.uuid])),
      ).rejects.toThrow(AdminTargetForbiddenError);
      expect(update).not.toHaveBeenCalled();
    });

    it("requires the target's approval when another active admin edits an admin", async () => {
      const otherAdmin = buildUser({ id: 50, roles: [adminRole] });
      const { useCase, update } = buildHarness(admin, otherAdmin, [adminRole]);

      await expect(
        useCase.execute(editAdmin(otherAdmin.id, [adminRole.uuid])),
      ).rejects.toThrow(AdminChangeApprovalRequiredError);
      expect(update).not.toHaveBeenCalled();
    });

    it('forbids another admin from removing ADMIN before routing them to a change request', async () => {
      const otherAdmin = buildUser({ id: 50, roles: [adminRole] });
      const { useCase, update } = buildHarness(admin, otherAdmin, [userRole]);

      await expect(
        useCase.execute(editAdmin(otherAdmin.id, [userRole.uuid])),
      ).rejects.toThrow(AdminRoleRemovalForbiddenError);
      expect(update).not.toHaveBeenCalled();
    });

    it('forbids an admin from removing their own ADMIN role', async () => {
      const { useCase, update } = buildHarness(admin, admin, [userRole]);

      await expect(
        useCase.execute(editAdmin(admin.id, [userRole.uuid])),
      ).rejects.toThrow(AdminRoleRemovalForbiddenError);
      expect(update).not.toHaveBeenCalled();
    });

    it('applies an admin self-edit directly and supersedes their pending change requests', async () => {
      const { useCase, update, supersedePendingForUser } = buildHarness(
        admin,
        admin,
        [adminRole, userRole],
      );

      const result = await useCase.execute(
        editAdmin(admin.id, [adminRole.uuid, userRole.uuid]),
      );

      expect(supersedePendingForUser).toHaveBeenCalledWith(admin.id);
      expect(update).toHaveBeenCalledTimes(1);
      expect(result.name).toBe('Admin Renamed');
      expect(result.roles).toEqual([adminRole, userRole]);
    });

    it('lets an admin edit a non-admin directly without touching change requests', async () => {
      const target = buildUser({ id: 9, uuid: 'user-9', roles: [userRole] });

      const { useCase, update, supersedePendingForUser } = buildHarness(
        target,
        admin,
        [userRole],
      );

      await useCase.execute({
        uuid: target.uuid,
        name: 'Renamed',
        email: target.email,
        roleUuids: [userRole.uuid],
        actorId: admin.id,
      });

      expect(update).toHaveBeenCalledTimes(1);
      expect(supersedePendingForUser).not.toHaveBeenCalled();
    });
  });

  it.each([
    {
      scenario: 'a requested role does not exist',
      resolved: [buildRole('role-1')],
      roleUuids: ['role-1', 'missing-role'],
      error: RoleNotFoundError,
    },
    {
      scenario: 'a requested role is inactive',
      resolved: [buildRole('role-1', RoleEnum.USER, RecordStatus.INACTIVE)],
      roleUuids: ['role-1'],
      error: InactiveRoleError,
    },
  ])(
    'throws $error.name when $scenario, without persisting or scheduling a confirmation',
    async ({ resolved, roleUuids, error }) => {
      const { user: existingUser, withProfile } =
        buildExistingUser('jane@example.com');

      const update = jest.fn();

      const userRepository = {
        lockAdminRoster: jest.fn(),
        countActiveAdmins: jest.fn().mockResolvedValue(2),
        findById: jest.fn().mockResolvedValue(null),
        findByUuidForUpdate: jest.fn().mockResolvedValue(existingUser),
        findByEmail: jest.fn().mockResolvedValue(null),
        update,
      } as unknown as UserRepository;

      const roleRepository = {
        findByUuids: jest.fn().mockResolvedValue(resolved),
      } as unknown as RoleRepository;

      const { port: emailOutbox, schedule } = buildEmailOutbox();

      const useCase = buildUseCase({
        userRepository,
        roleRepository,
        emailOutbox,
        transactionManager,
        tokenRepository: stubTokenRepository(),
        revokers: stubRevokers(),
      });

      await expect(
        useCase.execute({
          uuid: 'user-1',
          name: 'Jane Updated',
          email: 'jane.new@example.com',
          roleUuids,
          actorId: 102,
        }),
      ).rejects.toThrow(error);
      expect(withProfile).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(schedule).not.toHaveBeenCalled();
    },
  );

  it('checks role resolution before the ADMIN grant rule', async () => {
    const { user: existingUser } = buildExistingUser('jane@example.com');

    const userRepository = {
      lockAdminRoster: jest.fn(),
      countActiveAdmins: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue({
        status: RecordStatus.ACTIVE,
        deletedAt: null,
        roles: [{ name: RoleEnum.USER }],
      }),
      findByUuidForUpdate: jest.fn().mockResolvedValue(existingUser),
      findByEmail: jest.fn(),
      update: jest.fn(),
    } as unknown as UserRepository;

    const roleRepository = {
      findByUuids: jest
        .fn()
        .mockResolvedValue([buildRole('admin-role', RoleEnum.ADMIN)]),
    } as unknown as RoleRepository;

    const useCase = buildUseCase({
      userRepository,
      roleRepository,
      emailOutbox: buildEmailOutbox().port,
      transactionManager,
      tokenRepository: stubTokenRepository(),
      revokers: stubRevokers(),
    });

    await expect(
      useCase.execute({
        uuid: 'user-1',
        name: 'Jane',
        email: 'jane@example.com',
        roleUuids: ['admin-role', 'missing-role'],
        actorId: 102,
      }),
    ).rejects.toThrow(RoleNotFoundError);
  });

  describe('session revocation on a self-update', () => {
    const adminRole = buildRole('admin-role', RoleEnum.ADMIN);
    const userRole = buildRole('user-role', RoleEnum.USER);

    const regularUser = buildUser({
      id: 7,
      uuid: 'user-7',
      email: 'jane@example.com',
      roles: [userRole],
    });

    const admin = buildUser({
      id: 8,
      uuid: 'admin-8',
      email: 'admin@example.com',
      roles: [adminRole],
    });

    // Records the order of writes relative to the transaction boundary, so a
    // session revocation outside the unit of work would show up.
    function buildHarness(
      target: UserEntity,
      actor: UserEntity | null,
      revokeSessionsError?: Error,
    ): {
      useCase: UpdateUserUseCase;
      events: string[];
      revokeSessions: jest.Mock;
      schedule: jest.Mock;
    } {
      const events: string[] = [];

      const record =
        (event: string, result?: unknown) =>
        (...args: unknown[]): Promise<unknown> => {
          events.push(event);
          return Promise.resolve(result ?? args[0]);
        };

      const revokeSessions = jest
        .fn()
        .mockImplementation(
          revokeSessionsError
            ? () => Promise.reject(revokeSessionsError)
            : record('revoke-sessions'),
        );

      const schedule = jest
        .fn()
        .mockImplementation(record('schedule', { scheduled: true }));

      const useCase = buildUseCase({
        userRepository: mockOf<UserRepository>({
          lockAdminRoster: jest.fn().mockResolvedValue(undefined),
          findByUuidForUpdate: jest.fn().mockResolvedValue(target),
          findById: jest.fn().mockResolvedValue(actor),
          findByEmail: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockImplementation(record('update')),
        }),
        roleRepository: mockOf<RoleRepository>({
          findByUuids: jest.fn().mockResolvedValue(target.roles),
        }),
        emailOutbox: { schedule },
        transactionManager: {
          runInTransaction: async <T>(work: () => Promise<T>): Promise<T> => {
            events.push('begin');
            const result = await work();
            events.push('commit');
            return result;
          },
          runInSavepoint: <T>(work: () => Promise<T>): Promise<T> => work(),
        },
        tokenRepository: stubTokenRepository(
          jest.fn().mockImplementation(record('consume-confirmation-tokens')),
        ),
        revokers: stubRevokers(
          jest.fn().mockImplementation(record('revoke-email-tokens')),
        ),
        sessionRevokers: stubSessionRevokers(revokeSessions),
      });

      return { useCase, events, revokeSessions, schedule };
    }

    it.each([
      { role: 'USER', user: regularUser },
      { role: 'ADMIN', user: admin },
    ])(
      'revokes every session of a $role user who updates their own profile, inside the transaction',
      async ({ user }) => {
        const harness = buildHarness(user, user);

        await harness.useCase.execute({
          uuid: user.uuid,
          name: 'Renamed',
          actorId: user.id,
        });

        expect(harness.revokeSessions).toHaveBeenCalledTimes(1);
        expect(harness.revokeSessions).toHaveBeenCalledWith(user.id);
        expect(harness.events).toEqual([
          'begin',
          'update',
          'revoke-sessions',
          'commit',
        ]);
      },
    );

    it('revokes every session and still requires the new email to be confirmed when a user changes their own email', async () => {
      const harness = buildHarness(regularUser, regularUser);

      const result = await harness.useCase.execute({
        uuid: regularUser.uuid,
        email: 'jane.new@example.com',
        actorId: regularUser.id,
      });

      expect(result.emailConfirmedAt).toBeNull();
      expect(harness.schedule).toHaveBeenCalledWith({
        emailType: EmailType.EMAIL_CONFIRMATION,
        recipient: 'jane.new@example.com',
      });
      expect(harness.events).toEqual([
        'begin',
        'update',
        'revoke-sessions',
        'consume-confirmation-tokens',
        'revoke-email-tokens',
        'schedule',
        'commit',
      ]);
    });

    it.each([
      { scenario: 'an admin edits another user', actor: admin },
      { scenario: 'there is no actor', actor: null },
    ])('revokes no session when $scenario', async ({ actor }) => {
      const harness = buildHarness(regularUser, actor);

      await harness.useCase.execute({
        uuid: regularUser.uuid,
        name: 'Renamed',
        actorId: actor?.id ?? null,
      });

      expect(harness.revokeSessions).not.toHaveBeenCalled();
    });

    it('propagates a session revocation failure out of the transaction so the update rolls back', async () => {
      const harness = buildHarness(
        regularUser,
        regularUser,
        new Error('db down'),
      );

      await expect(
        harness.useCase.execute({
          uuid: regularUser.uuid,
          email: 'jane.new@example.com',
          actorId: regularUser.id,
        }),
      ).rejects.toThrow('db down');
      expect(harness.events).not.toContain('commit');
      expect(harness.schedule).not.toHaveBeenCalled();
    });
  });

  describe('token revocation on an email change', () => {
    interface Harness {
      useCase: UpdateUserUseCase;
      events: string[];
      consumeAllForUser: jest.Mock;
      revokeAllForUser: jest.Mock;
      schedule: jest.Mock;
      updatedUser: UserEntity;
    }

    // Records the order of writes relative to the transaction boundary, so a
    // revocation or scheduling step outside the unit of work would show up.
    function buildHarness(
      overrides: {
        consumeAllForUser?: jest.Mock;
        revokeAllForUser?: jest.Mock;
        schedule?: jest.Mock;
      } = {},
    ): Harness {
      const events: string[] = [];
      const { user: existingUser } = buildExistingUser('jane@example.com');

      const updatedUser = {
        id: 7,
        uuid: 'user-1',
        email: 'jane.new@example.com',
      } as UserEntity;

      const userRepository = mockOf<UserRepository>({
        lockAdminRoster: jest.fn().mockResolvedValue(undefined),
        countActiveAdmins: jest.fn().mockResolvedValue(2),
        findById: jest.fn().mockResolvedValue(null),
        findByUuidForUpdate: jest.fn().mockResolvedValue(existingUser),
        findByEmail: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation(() => {
          events.push('update');
          return Promise.resolve(updatedUser);
        }),
      });

      const consumeAllForUser =
        overrides.consumeAllForUser ??
        jest.fn().mockImplementation(() => {
          events.push('consume-confirmation-tokens');
          return Promise.resolve();
        });

      const revokeAllForUser =
        overrides.revokeAllForUser ??
        jest.fn().mockImplementation(() => {
          events.push('revoke-other-tokens');
          return Promise.resolve();
        });

      const schedule =
        overrides.schedule ??
        jest.fn().mockImplementation(() => {
          events.push('schedule');
          return Promise.resolve({ scheduled: true });
        });

      const recordingTransactionManager = {
        runInTransaction: async <T>(work: () => Promise<T>): Promise<T> => {
          events.push('begin');
          const result = await work();
          events.push('commit');
          return result;
        },
        runInSavepoint: <T>(work: () => Promise<T>): Promise<T> => work(),
      };

      const useCase = buildUseCase({
        userRepository,
        roleRepository: mockOf<RoleRepository>({
          findByUuids: jest.fn().mockResolvedValue([]),
        }),
        emailOutbox: { schedule },
        transactionManager: recordingTransactionManager,
        tokenRepository: stubTokenRepository(consumeAllForUser),
        revokers: stubRevokers(revokeAllForUser),
      });

      return {
        useCase,
        events,
        consumeAllForUser,
        revokeAllForUser,
        schedule,
        updatedUser,
      };
    }

    const changeEmail = {
      uuid: 'user-1',
      name: 'Jane',
      email: 'jane.new@example.com',
      roleUuids: [],
      actorId: null,
    };

    it('consumes confirmation tokens, runs every registered revoker and schedules the new confirmation inside the same transaction as the user update', async () => {
      const harness = buildHarness();

      await harness.useCase.execute(changeEmail);

      expect(harness.consumeAllForUser).toHaveBeenCalledWith(7);
      expect(harness.revokeAllForUser).toHaveBeenCalledWith(7);
      expect(harness.schedule).toHaveBeenCalledWith({
        emailType: EmailType.EMAIL_CONFIRMATION,
        recipient: 'jane.new@example.com',
      });
      expect(harness.events).toEqual([
        'begin',
        'update',
        'consume-confirmation-tokens',
        'revoke-other-tokens',
        'schedule',
        'commit',
      ]);
    });

    it('revokes nothing when the email is unchanged', async () => {
      const harness = buildHarness();

      await harness.useCase.execute({
        ...changeEmail,
        email: 'jane@example.com',
      });

      expect(harness.consumeAllForUser).not.toHaveBeenCalled();
      expect(harness.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('still revokes outstanding tokens and commits the change when the send quota is exhausted', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      const harness = buildHarness({
        schedule: jest
          .fn()
          .mockResolvedValue({ scheduled: false, reason: 'EXHAUSTED' }),
      });

      await expect(harness.useCase.execute(changeEmail)).resolves.toBe(
        harness.updatedUser,
      );

      expect(harness.events).toEqual([
        'begin',
        'update',
        'consume-confirmation-tokens',
        'revoke-other-tokens',
        'commit',
      ]);

      warnSpy.mockRestore();
    });

    it('aborts the transaction when scheduling is unavailable, so the email change and its revocations roll back together', async () => {
      const harness = buildHarness({
        schedule: jest
          .fn()
          .mockResolvedValue({ scheduled: false, reason: 'UNAVAILABLE' }),
      });

      await expect(harness.useCase.execute(changeEmail)).rejects.toThrow(
        EmailSchedulingUnavailableError,
      );
      expect(harness.revokeAllForUser).toHaveBeenCalledWith(7);
      expect(harness.events).not.toContain('commit');
    });

    it('propagates a revoker failure out of the transaction so the email change rolls back, and schedules nothing', async () => {
      const harness = buildHarness({
        revokeAllForUser: jest.fn().mockRejectedValue(new Error('db down')),
      });

      await expect(harness.useCase.execute(changeEmail)).rejects.toThrow(
        'db down',
      );
      expect(harness.events).not.toContain('commit');
      expect(harness.schedule).not.toHaveBeenCalled();
    });
  });
});
