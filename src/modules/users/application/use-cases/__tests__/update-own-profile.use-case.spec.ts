import { Logger } from '@nestjs/common';
import { RoleEnum } from '@modules/authorization/domain/enums/role.enum';
import type { RoleEntity } from '@modules/authorization/domain/entities/role.entity';
import { EmailSchedulingUnavailableError } from '@shared/application/ports';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildUser } from '@test/support/builders/user.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { UserEntity } from '../../../domain/entities/user.entity';
import { CurrentPasswordRequiredError } from '../../../domain/errors/current-password-required.error';
import { EmailAlreadyInUseError } from '../../../domain/errors/email-already-in-use.error';
import { InactiveUserError } from '../../../domain/errors/inactive-user.error';
import { InvalidCurrentPasswordError } from '../../../domain/errors/invalid-current-password.error';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import type { EmailConfirmationTokenRepository } from '../../../domain/repositories/email-confirmation-token.repository';
import type { UserChangeRequestRepository } from '../../../domain/repositories/user-change-request.repository';
import type { UserRepository } from '../../../domain/repositories/user.repository';
import type { EmailChangeTokenRevokerRegistry } from '../../ports/email-change-token-revoker.port';
import type { PasswordHasher } from '../../ports/password-hasher.port';
import type { UserSessionRevokerRegistry } from '../../ports/user-session-revoker.port';
import { UserProfileChangeService } from '../../services/user-profile-change.service';
import { UpdateOwnProfileUseCase } from '../update-own-profile.use-case';

function role(uuid: string, name: RoleEnum): RoleEntity {
  return {
    uuid,
    name,
    status: RecordStatus.ACTIVE,
    deletedAt: null,
  } as RoleEntity;
}

const userRole = role('user-role', RoleEnum.USER);
const adminRole = role('admin-role', RoleEnum.ADMIN);

const CURRENT_PASSWORD = 'Secret123!';

const regularUser = buildUser({
  id: 7,
  name: 'Jane Doe',
  email: 'jane@example.com',
  password: `hashed:${CURRENT_PASSWORD}`,
  emailConfirmedAt: new Date('2026-01-01T00:00:00.000Z'),
  roles: [userRole],
});

const passwordHasher: PasswordHasher = {
  hash: (plain) => Promise.resolve(`hashed:${plain}`),
  verify: (hash, plain) => Promise.resolve(hash === `hashed:${plain}`),
};

const transactionManager = {
  runInTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
  runInSavepoint: <T>(work: () => Promise<T>): Promise<T> => work(),
};

function buildHarness(
  options: {
    user?: UserEntity | null;
    emailOwner?: UserEntity | null;
    schedule?: jest.Mock;
    revokeSessions?: jest.Mock;
  } = {},
) {
  const update = jest
    .fn()
    .mockImplementation((user: UserEntity) => Promise.resolve(user));

  const findByIdForUpdate = jest
    .fn()
    .mockResolvedValue(options.user === undefined ? regularUser : options.user);

  const userRepository = mockOf<UserRepository>({
    findByIdForUpdate,
    findByEmail: jest.fn().mockResolvedValue(options.emailOwner ?? null),
    update,
  });

  const supersedePendingForUser = jest.fn().mockResolvedValue(undefined);

  const schedule =
    options.schedule ?? jest.fn().mockResolvedValue({ scheduled: true });

  const consumeAllForUser = jest.fn().mockResolvedValue(undefined);
  const revokeEmailChangeTokens = jest.fn().mockResolvedValue(undefined);

  const revokeSessions =
    options.revokeSessions ?? jest.fn().mockResolvedValue(undefined);

  const useCase = new UpdateOwnProfileUseCase(
    userRepository,
    mockOf<UserChangeRequestRepository>({ supersedePendingForUser }),
    transactionManager,
    passwordHasher,
    { schedule },
    new UserProfileChangeService(
      userRepository,
      { schedule },
      mockOf<EmailConfirmationTokenRepository>({ consumeAllForUser }),
      mockOf<EmailChangeTokenRevokerRegistry>({
        revokeAllForUser: revokeEmailChangeTokens,
      }),
      mockOf<UserSessionRevokerRegistry>({ revokeAllForUser: revokeSessions }),
    ),
  );

  return {
    useCase,
    update,
    findByIdForUpdate,
    supersedePendingForUser,
    schedule,
    consumeAllForUser,
    revokeEmailChangeTokens,
    revokeSessions,
  };
}

describe('UpdateOwnProfileUseCase', () => {
  it('locks and updates the actor own row, keeping roles and status, and revokes every session', async () => {
    const { useCase, update, findByIdForUpdate, revokeSessions, schedule } =
      buildHarness();

    const result = await useCase.execute({ actorId: 7, name: 'Jane Renamed' });

    expect(findByIdForUpdate).toHaveBeenCalledWith(7);

    const [written] = update.mock.calls[0] as [UserEntity];
    expect(written.name).toBe('Jane Renamed');
    expect(written.email).toBe('jane@example.com');
    expect(written.roles).toEqual([userRole]);
    expect(written.status).toBe(RecordStatus.ACTIVE);
    expect(written.emailConfirmedAt).toEqual(regularUser.emailConfirmedAt);
    expect(written.updatedBy).toBe(7);
    expect(result).toBe(written);

    expect(revokeSessions).toHaveBeenCalledWith(7);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('revokes every session on an empty update', async () => {
    const { useCase, update, revokeSessions } = buildHarness();

    await useCase.execute({ actorId: 7 });

    const [written] = update.mock.calls[0] as [UserEntity];
    expect(written.name).toBe('Jane Doe');
    expect(written.email).toBe('jane@example.com');
    expect(revokeSessions).toHaveBeenCalledWith(7);
  });

  it('normalizes a changed email, un-confirms it, revokes outstanding tokens, and schedules a confirmation', async () => {
    const {
      useCase,
      update,
      schedule,
      consumeAllForUser,
      revokeEmailChangeTokens,
      revokeSessions,
    } = buildHarness();

    await useCase.execute({
      actorId: 7,
      email: ' Jane.New@Example.COM ',
      currentPassword: CURRENT_PASSWORD,
    });

    const [written] = update.mock.calls[0] as [UserEntity];
    expect(written.email).toBe('jane.new@example.com');
    expect(written.emailConfirmedAt).toBeNull();
    expect(consumeAllForUser).toHaveBeenCalledWith(7);
    expect(revokeEmailChangeTokens).toHaveBeenCalledWith(7);
    expect(revokeSessions).toHaveBeenCalledWith(7);
    expect(schedule).toHaveBeenCalledWith({
      emailType: EmailType.EMAIL_CONFIRMATION,
      recipient: 'jane.new@example.com',
    });
  });

  it('schedules a notice to the previous address, never to the new one', async () => {
    const { useCase, schedule } = buildHarness();

    await useCase.execute({
      actorId: 7,
      email: 'jane.new@example.com',
      currentPassword: CURRENT_PASSWORD,
    });

    expect(schedule).toHaveBeenCalledWith({
      emailType: EmailType.EMAIL_CHANGE_NOTICE,
      recipient: 'jane@example.com',
    });
    expect(schedule).not.toHaveBeenCalledWith(
      expect.objectContaining({
        emailType: EmailType.EMAIL_CHANGE_NOTICE,
        recipient: 'jane.new@example.com',
      }),
    );
  });

  it('requires the current password to change the email, before checking whether the address is taken', async () => {
    const { useCase, update, schedule, revokeSessions } = buildHarness({
      emailOwner: buildUser({ id: 8, email: 'taken@example.com' }),
    });

    await expect(
      useCase.execute({ actorId: 7, email: 'taken@example.com' }),
    ).rejects.toBeInstanceOf(CurrentPasswordRequiredError);
    expect(update).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    expect(revokeSessions).not.toHaveBeenCalled();
  });

  it('rejects a wrong current password before checking whether the address is taken', async () => {
    const { useCase, update, revokeSessions } = buildHarness({
      emailOwner: buildUser({ id: 8, email: 'taken@example.com' }),
    });

    await expect(
      useCase.execute({
        actorId: 7,
        email: 'taken@example.com',
        currentPassword: 'Wrong123!',
      }),
    ).rejects.toBeInstanceOf(InvalidCurrentPasswordError);
    expect(update).not.toHaveBeenCalled();
    expect(revokeSessions).not.toHaveBeenCalled();
  });

  it('does not require the current password for a name-only update', async () => {
    const { useCase, update } = buildHarness();

    await useCase.execute({ actorId: 7, name: 'Jane Renamed' });

    expect(update).toHaveBeenCalled();
  });

  it('ignores a wrong current password when the email does not change', async () => {
    const { useCase, update, schedule } = buildHarness();

    await useCase.execute({
      actorId: 7,
      email: 'jane@example.com',
      currentPassword: 'Wrong123!',
    });

    expect(update).toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('fails the update when the notice to the previous address cannot be scheduled', async () => {
    const { useCase } = buildHarness({
      schedule: jest
        .fn()
        .mockResolvedValueOnce({ scheduled: true })
        .mockResolvedValueOnce({ scheduled: false, reason: 'UNAVAILABLE' }),
    });

    await expect(
      useCase.execute({
        actorId: 7,
        email: 'jane.new@example.com',
        currentPassword: CURRENT_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(EmailSchedulingUnavailableError);
  });

  it('still applies the change and logs when the send quota denies the notice', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    const { useCase, update } = buildHarness({
      schedule: jest
        .fn()
        .mockResolvedValueOnce({ scheduled: true })
        .mockResolvedValueOnce({ scheduled: false, reason: 'EXHAUSTED' }),
    });

    await useCase.execute({
      actorId: 7,
      email: 'jane.new@example.com',
      currentPassword: CURRENT_PASSWORD,
    });

    expect(update).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith({
      msg: 'Email change notice not scheduled',
      userId: regularUser.uuid,
      reason: 'EXHAUSTED',
    });
    warn.mockRestore();
  });

  it('treats a casing-only email edit as unchanged', async () => {
    const { useCase, update, schedule, consumeAllForUser } = buildHarness();

    await useCase.execute({ actorId: 7, email: 'JANE@example.com' });

    const [written] = update.mock.calls[0] as [UserEntity];
    expect(written.emailConfirmedAt).toEqual(regularUser.emailConfirmedAt);
    expect(consumeAllForUser).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('rejects an email owned by another account without writing', async () => {
    const { useCase, update, revokeSessions } = buildHarness({
      emailOwner: buildUser({ id: 8, email: 'taken@example.com' }),
    });

    await expect(
      useCase.execute({
        actorId: 7,
        email: 'taken@example.com',
        currentPassword: CURRENT_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(EmailAlreadyInUseError);
    expect(update).not.toHaveBeenCalled();
    expect(revokeSessions).not.toHaveBeenCalled();
  });

  it('fails the update when the confirmation email cannot be scheduled', async () => {
    const { useCase } = buildHarness({
      schedule: jest
        .fn()
        .mockResolvedValue({ scheduled: false, reason: 'UNAVAILABLE' }),
    });

    await expect(
      useCase.execute({
        actorId: 7,
        email: 'jane.new@example.com',
        currentPassword: CURRENT_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(EmailSchedulingUnavailableError);
  });

  it('keeps the ADMIN role of an admin and supersedes their pending change requests', async () => {
    const admin = buildUser({ id: 7, roles: [adminRole] });

    const { useCase, update, supersedePendingForUser, revokeSessions } =
      buildHarness({ user: admin });

    await useCase.execute({ actorId: 7, name: 'Admin Renamed' });

    const [written] = update.mock.calls[0] as [UserEntity];
    expect(written.roles).toEqual([adminRole]);
    expect(supersedePendingForUser).toHaveBeenCalledWith(7);
    expect(revokeSessions).toHaveBeenCalledWith(7);
  });

  it('leaves change requests alone for a non-admin', async () => {
    const { useCase, supersedePendingForUser } = buildHarness();

    await useCase.execute({ actorId: 7, name: 'Jane Renamed' });

    expect(supersedePendingForUser).not.toHaveBeenCalled();
  });

  it('throws UserNotFoundError when the actor no longer exists', async () => {
    const { useCase, update } = buildHarness({ user: null });

    await expect(useCase.execute({ actorId: 7 })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('throws InactiveUserError when the actor was deactivated', async () => {
    const { useCase, update } = buildHarness({
      user: buildUser({ id: 7, status: RecordStatus.INACTIVE }),
    });

    await expect(useCase.execute({ actorId: 7 })).rejects.toBeInstanceOf(
      InactiveUserError,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('propagates a revocation failure so the transaction rolls back', async () => {
    const { useCase } = buildHarness({
      revokeSessions: jest.fn().mockRejectedValue(new Error('boom')),
    });

    await expect(
      useCase.execute({ actorId: 7, name: 'Jane Renamed' }),
    ).rejects.toThrow('boom');
  });
});
