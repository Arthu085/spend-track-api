import { Logger } from '@nestjs/common';
import type { AppConfigService } from '@core/config';
import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import type { RoleEntity } from '@modules/authorization/domain/entities/role.entity';
import type { RoleRepository } from '@modules/authorization/domain/repositories/role.repository';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  EmailSchedulingUnavailableError,
  type EmailOutboxPort,
} from '@shared/application/ports';
import { buildUser } from '@test/support/builders/user.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { UserEntity } from '../../../domain/entities/user.entity';
import type { UserChangeRequestEntity } from '../../../domain/entities/user-change-request.entity';
import { UserChangeRequestStatus } from '../../../domain/enums/user-change-request-status.enum';
import { AdminRoleRemovalForbiddenError } from '../../../domain/errors/admin-role-removal-forbidden.error';
import { AdminTargetForbiddenError } from '../../../domain/errors/admin-target-forbidden.error';
import { EmailAlreadyInUseError } from '../../../domain/errors/email-already-in-use.error';
import { UserChangeRequestNotApplicableError } from '../../../domain/errors/user-change-request-not-applicable.error';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import type { EmailConfirmationTokenRepository } from '../../../domain/repositories/email-confirmation-token.repository';
import type { UserChangeRequestRepository } from '../../../domain/repositories/user-change-request.repository';
import type { UserRepository } from '../../../domain/repositories/user.repository';
import type { EmailChangeTokenRevokerRegistry } from '../../ports/email-change-token-revoker.port';
import type { UserSessionRevokerRegistry } from '../../ports/user-session-revoker.port';
import { UserProfileChangeService } from '../../services/user-profile-change.service';
import { RequestUserChangeUseCase } from '../request-user-change.use-case';

function role(uuid: string, name: RoleEnum): RoleEntity {
  return {
    uuid,
    name,
    status: RecordStatus.ACTIVE,
    deletedAt: null,
  } as RoleEntity;
}

const adminRole = role('admin-role', RoleEnum.ADMIN);
const userRole = role('user-role', RoleEnum.USER);

const target = buildUser({
  id: 7,
  uuid: 'target-uuid',
  name: 'Target Admin',
  email: 'target@example.com',
  roles: [adminRole],
});

const requester = buildUser({ id: 9, uuid: 'requester', roles: [adminRole] });

const transactionManager = {
  runInTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
  runInSavepoint: <T>(work: () => Promise<T>): Promise<T> => work(),
};

interface HarnessOptions {
  target?: UserEntity | null;
  actor?: UserEntity | null;
  resolvedRoles?: RoleEntity[];
  emailOwner?: UserEntity | null;
  schedule?: jest.Mock;
}

function buildHarness(options: HarnessOptions = {}) {
  const userRepository = mockOf<UserRepository>({
    lockAdminRoster: jest.fn().mockResolvedValue(undefined),
    findByUuidForUpdate: jest
      .fn()
      .mockResolvedValue(
        options.target === undefined ? target : options.target,
      ),
    findById: jest
      .fn()
      .mockResolvedValue(
        options.actor === undefined ? requester : options.actor,
      ),
    findByEmail: jest.fn().mockResolvedValue(options.emailOwner ?? null),
  });

  const supersedePendingForUser = jest.fn().mockResolvedValue(undefined);

  const create = jest
    .fn()
    .mockImplementation((request: UserChangeRequestEntity) =>
      Promise.resolve(request),
    );

  const schedule =
    options.schedule ?? jest.fn().mockResolvedValue({ scheduled: true });

  const emailOutbox: EmailOutboxPort = { schedule };

  const useCase = new RequestUserChangeUseCase(
    userRepository,
    mockOf<RoleRepository>({
      findByUuids: jest
        .fn()
        .mockResolvedValue(options.resolvedRoles ?? [adminRole, userRole]),
    }),
    mockOf<UserChangeRequestRepository>({ supersedePendingForUser, create }),
    emailOutbox,
    transactionManager,
    new UserProfileChangeService(
      userRepository,
      emailOutbox,
      mockOf<EmailConfirmationTokenRepository>({}),
      mockOf<EmailChangeTokenRevokerRegistry>({}),
      mockOf<UserSessionRevokerRegistry>({}),
    ),
    mockOf<AppConfigService>({
      verificationTokens: {
        emailConfirmationTtlHours: 48,
        passwordResetTtlMinutes: 60,
        userChangeRequestTtlHours: 2,
      },
    }),
  );

  return { useCase, supersedePendingForUser, create, schedule };
}

const input = {
  uuid: 'target-uuid',
  name: 'Renamed Admin',
  email: '  New@Example.com ',
  roleUuids: ['admin-role', 'user-role'],
  actorId: 9,
};

describe('RequestUserChangeUseCase', () => {
  it('supersedes older requests, stores current and requested values, and notifies the target', async () => {
    const { useCase, supersedePendingForUser, create, schedule } =
      buildHarness();

    const before = Date.now();

    const request = await useCase.execute(input);

    expect(supersedePendingForUser).toHaveBeenCalledWith(7);
    expect(supersedePendingForUser.mock.invocationCallOrder[0]).toBeLessThan(
      create.mock.invocationCallOrder[0],
    );
    expect(request.status).toBe(UserChangeRequestStatus.PENDING);
    expect(request.targetUserId).toBe(7);
    expect(request.requestedBy).toBe(9);
    expect(request.current).toEqual({
      name: 'Target Admin',
      email: 'target@example.com',
      roles: [adminRole],
    });
    expect(request.requested).toEqual({
      name: 'Renamed Admin',
      email: 'new@example.com',
      roles: [adminRole, userRole],
    });
    expect(request.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 2 * 60 * 60 * 1000,
    );
    expect(schedule).toHaveBeenCalledWith({
      emailType: EmailType.USER_CHANGE_REQUEST,
      recipient: 'target@example.com',
    });
  });

  it('keeps the current values for omitted fields', async () => {
    const { useCase } = buildHarness();

    const request = await useCase.execute({
      uuid: 'target-uuid',
      name: 'Renamed Admin',
      actorId: 9,
    });

    expect(request.requested).toEqual({
      name: 'Renamed Admin',
      email: 'target@example.com',
      roles: [adminRole],
    });
  });

  it('throws UserNotFoundError when the target does not exist', async () => {
    const { useCase, create } = buildHarness({ target: null });

    await expect(useCase.execute(input)).rejects.toThrow(UserNotFoundError);
    expect(create).not.toHaveBeenCalled();
  });

  it('forbids a non-admin actor', async () => {
    const { useCase, create } = buildHarness({
      actor: buildUser({ id: 9, roles: [userRole] }),
    });

    await expect(useCase.execute(input)).rejects.toThrow(
      AdminTargetForbiddenError,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    {
      scenario: 'the target is not an admin',
      targetUser: buildUser({ id: 7, uuid: 'target-uuid', roles: [userRole] }),
      actorId: 9,
    },
    {
      scenario: 'the admin targets themselves',
      targetUser: target,
      actorId: 7,
    },
  ])('rejects a request when $scenario', async ({ targetUser, actorId }) => {
    const { useCase, create } = buildHarness({
      target: targetUser,
      actor: buildUser({ id: actorId, roles: [adminRole] }),
    });

    await expect(useCase.execute({ ...input, actorId })).rejects.toThrow(
      UserChangeRequestNotApplicableError,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a request that would remove ADMIN', async () => {
    const { useCase, create } = buildHarness({ resolvedRoles: [userRole] });

    await expect(
      useCase.execute({ ...input, roleUuids: ['user-role'] }),
    ).rejects.toThrow(AdminRoleRemovalForbiddenError);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects an email already used by another account', async () => {
    const { useCase, create } = buildHarness({
      emailOwner: buildUser({ id: 99 }),
    });

    await expect(useCase.execute(input)).rejects.toThrow(
      EmailAlreadyInUseError,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('rolls back when the notification cannot be scheduled', async () => {
    const { useCase } = buildHarness({
      schedule: jest
        .fn()
        .mockResolvedValue({ scheduled: false, reason: 'UNAVAILABLE' }),
    });

    await expect(useCase.execute(input)).rejects.toThrow(
      EmailSchedulingUnavailableError,
    );
  });

  it('keeps the request and logs a warning when the send quota denies the notification', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    const { useCase } = buildHarness({
      schedule: jest
        .fn()
        .mockResolvedValue({ scheduled: false, reason: 'EXHAUSTED' }),
    });

    const request = await useCase.execute(input);

    expect(warnSpy).toHaveBeenCalledWith({
      msg: 'Change request notification not scheduled',
      changeRequestId: request.uuid,
      reason: 'EXHAUSTED',
    });

    warnSpy.mockRestore();
  });
});
