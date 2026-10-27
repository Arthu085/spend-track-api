import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import type { RoleEntity } from '@modules/authorization/domain/entities/role.entity';
import type { RoleRepository } from '@modules/authorization/domain/repositories/role.repository';
import { InactiveRoleError } from '@modules/authorization/domain/errors/inactive-role.error';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildUser } from '@test/support/builders/user.builder';
import { buildUserChangeRequest } from '@test/support/builders/user-change-request.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { UserEntity } from '../../../domain/entities/user.entity';
import type { UserChangeRequestEntity } from '../../../domain/entities/user-change-request.entity';
import { UserChangeRequestStatus } from '../../../domain/enums/user-change-request-status.enum';
import { EmailAlreadyInUseError } from '../../../domain/errors/email-already-in-use.error';
import { InactiveUserError } from '../../../domain/errors/inactive-user.error';
import { UserChangeRequestNotFoundError } from '../../../domain/errors/user-change-request-not-found.error';
import { UserChangeRequestNotPendingError } from '../../../domain/errors/user-change-request-not-pending.error';
import { UserChangeRequestRecipientForbiddenError } from '../../../domain/errors/user-change-request-recipient-forbidden.error';
import { UserChangeRequestStaleError } from '../../../domain/errors/user-change-request-stale.error';
import type { EmailConfirmationTokenRepository } from '../../../domain/repositories/email-confirmation-token.repository';
import type { UserChangeRequestRepository } from '../../../domain/repositories/user-change-request.repository';
import type { UserRepository } from '../../../domain/repositories/user.repository';
import type { EmailChangeTokenRevokerRegistry } from '../../ports/email-change-token-revoker.port';
import type { UserSessionRevokerRegistry } from '../../ports/user-session-revoker.port';
import { UserProfileChangeService } from '../../services/user-profile-change.service';
import { ApproveUserChangeRequestUseCase } from '../approve-user-change-request.use-case';

function role(
  uuid: string,
  name: RoleEnum,
  status = RecordStatus.ACTIVE,
): RoleEntity {
  return { uuid, name, status, deletedAt: null } as RoleEntity;
}

const adminRole = role('admin-role', RoleEnum.ADMIN);
const userRole = role('user-role', RoleEnum.USER);

const admin = buildUser({
  id: 7,
  name: 'Admin',
  email: 'admin@example.com',
  roles: [adminRole],
});

function pendingRequest(
  overrides: Parameters<typeof buildUserChangeRequest>[0] = {},
): UserChangeRequestEntity {
  return buildUserChangeRequest({
    targetUserId: 7,
    current: { name: 'Admin', email: 'admin@example.com', roles: [adminRole] },
    requested: {
      name: 'Admin Renamed',
      email: 'admin.new@example.com',
      roles: [adminRole, userRole],
    },
    ...overrides,
  });
}

const transactionManager = {
  runInTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
  runInSavepoint: <T>(work: () => Promise<T>): Promise<T> => work(),
};

function buildHarness(
  options: {
    user?: UserEntity | null;
    request?: UserChangeRequestEntity | null;
    resolvedRoles?: RoleEntity[];
    emailOwner?: UserEntity | null;
    revokeSessions?: jest.Mock;
  } = {},
) {
  const update = jest
    .fn()
    .mockImplementation((user: UserEntity) => Promise.resolve(user));

  const userRepository = mockOf<UserRepository>({
    findByIdForUpdate: jest
      .fn()
      .mockResolvedValue(options.user === undefined ? admin : options.user),
    findByEmail: jest.fn().mockResolvedValue(options.emailOwner ?? null),
    update,
  });

  const saveDecision = jest
    .fn<Promise<void>, [UserChangeRequestEntity]>()
    .mockResolvedValue(undefined);

  const schedule = jest.fn().mockResolvedValue({ scheduled: true });
  const consumeAllForUser = jest.fn().mockResolvedValue(undefined);
  const revokeAllForUser = jest.fn().mockResolvedValue(undefined);

  const revokeSessions =
    options.revokeSessions ?? jest.fn().mockResolvedValue(undefined);

  const useCase = new ApproveUserChangeRequestUseCase(
    userRepository,
    mockOf<RoleRepository>({
      findByUuids: jest
        .fn()
        .mockResolvedValue(options.resolvedRoles ?? [adminRole, userRole]),
    }),
    mockOf<UserChangeRequestRepository>({
      findByUuid: jest
        .fn()
        .mockResolvedValue(
          options.request === undefined ? pendingRequest() : options.request,
        ),
      saveDecision,
    }),
    transactionManager,
    new UserProfileChangeService(
      userRepository,
      { schedule },
      mockOf<EmailConfirmationTokenRepository>({ consumeAllForUser }),
      mockOf<EmailChangeTokenRevokerRegistry>({ revokeAllForUser }),
      mockOf<UserSessionRevokerRegistry>({ revokeAllForUser: revokeSessions }),
    ),
  );

  return {
    useCase,
    update,
    saveDecision,
    schedule,
    consumeAllForUser,
    revokeSessions,
  };
}

const approve = { uuid: 'change-request-uuid', actorId: 7 };

describe('ApproveUserChangeRequestUseCase', () => {
  it('marks the request approved and applies the requested values with the email-change side effects', async () => {
    const { useCase, saveDecision, update, schedule, consumeAllForUser } =
      buildHarness();

    const result = await useCase.execute(approve);

    const [decided] = saveDecision.mock.calls[0];
    expect(decided.status).toBe(UserChangeRequestStatus.APPROVED);
    expect(update).toHaveBeenCalledTimes(1);
    expect(result.name).toBe('Admin Renamed');
    expect(result.email).toBe('admin.new@example.com');
    expect(result.roles).toEqual([adminRole, userRole]);
    expect(result.emailConfirmedAt).toBeNull();
    expect(result.updatedBy).toBe(7);
    expect(consumeAllForUser).toHaveBeenCalledWith(7);
    expect(schedule).toHaveBeenCalledWith({
      emailType: EmailType.EMAIL_CONFIRMATION,
      recipient: 'admin.new@example.com',
    });
  });

  it.each([
    { scenario: 'with an email change', request: pendingRequest() },
    {
      scenario: 'without an email change',
      request: pendingRequest({
        requested: {
          name: 'Admin Renamed',
          email: 'admin@example.com',
          roles: [adminRole],
        },
      }),
    },
  ])(
    'revokes every session of the approving user $scenario',
    async ({ request }) => {
      const { useCase, update, revokeSessions } = buildHarness({ request });

      await useCase.execute(approve);

      expect(revokeSessions).toHaveBeenCalledTimes(1);
      expect(revokeSessions).toHaveBeenCalledWith(7);
      expect(update.mock.invocationCallOrder[0]).toBeLessThan(
        revokeSessions.mock.invocationCallOrder[0],
      );
    },
  );

  it('propagates a session revocation failure so the approval rolls back, and schedules nothing', async () => {
    const { useCase, schedule } = buildHarness({
      revokeSessions: jest.fn().mockRejectedValue(new Error('db down')),
    });

    await expect(useCase.execute(approve)).rejects.toThrow('db down');
    expect(schedule).not.toHaveBeenCalled();
  });

  it.each([
    { scenario: 'missing', request: null },
    {
      scenario: 'addressed to someone else',
      request: pendingRequest({ targetUserId: 8 }),
    },
  ])('returns 404 when the request is $scenario', async ({ request }) => {
    const { useCase, update } = buildHarness({ request });

    await expect(useCase.execute(approve)).rejects.toThrow(
      UserChangeRequestNotFoundError,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    { status: UserChangeRequestStatus.REJECTED, expiresAt: undefined },
    {
      status: UserChangeRequestStatus.PENDING,
      expiresAt: new Date(Date.now() - 1000),
    },
  ])(
    'refuses a request that is $status or expired',
    async ({ status, expiresAt }) => {
      const { useCase, update } = buildHarness({
        request: pendingRequest({
          status,
          ...(expiresAt ? { expiresAt } : {}),
        }),
      });

      await expect(useCase.execute(approve)).rejects.toThrow(
        UserChangeRequestNotPendingError,
      );
      expect(update).not.toHaveBeenCalled();
    },
  );

  it('refuses a request whose snapshot no longer matches the profile', async () => {
    const { useCase, update, saveDecision } = buildHarness({
      user: buildUser({ ...admin, name: 'Changed Meanwhile' }),
    });

    await expect(useCase.execute(approve)).rejects.toThrow(
      UserChangeRequestStaleError,
    );
    expect(update).not.toHaveBeenCalled();
    expect(saveDecision).not.toHaveBeenCalled();
  });

  it('refuses when the user is inactive', async () => {
    const { useCase } = buildHarness({
      user: buildUser({ ...admin, status: RecordStatus.INACTIVE }),
    });

    await expect(useCase.execute(approve)).rejects.toThrow(InactiveUserError);
  });

  it('refuses a user who does not hold ADMIN', async () => {
    const { useCase, update, saveDecision } = buildHarness({
      user: buildUser({ ...admin, roles: [userRole] }),
    });

    await expect(useCase.execute(approve)).rejects.toThrow(
      UserChangeRequestRecipientForbiddenError,
    );
    expect(update).not.toHaveBeenCalled();
    expect(saveDecision).not.toHaveBeenCalled();
  });

  it('revalidates the email and roles at approval time', async () => {
    await expect(
      buildHarness({ emailOwner: buildUser({ id: 99 }) }).useCase.execute(
        approve,
      ),
    ).rejects.toThrow(EmailAlreadyInUseError);

    await expect(
      buildHarness({
        resolvedRoles: [
          adminRole,
          role('user-role', RoleEnum.USER, RecordStatus.INACTIVE),
        ],
      }).useCase.execute(approve),
    ).rejects.toThrow(InactiveRoleError);
  });
});
