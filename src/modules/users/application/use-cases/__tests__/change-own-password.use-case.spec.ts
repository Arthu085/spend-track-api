import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildUser } from '@test/support/builders/user.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { UserEntity } from '../../../domain/entities/user.entity';
import { InactiveUserError } from '../../../domain/errors/inactive-user.error';
import { InvalidCurrentPasswordError } from '../../../domain/errors/invalid-current-password.error';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import type { UserRepository } from '../../../domain/repositories/user.repository';
import type { PasswordChangeTokenRevokerRegistry } from '../../ports/password-change-token-revoker.port';
import type { PasswordHasher } from '../../ports/password-hasher.port';
import type { UserSessionRevokerRegistry } from '../../ports/user-session-revoker.port';
import { ChangeOwnPasswordUseCase } from '../change-own-password.use-case';

const CURRENT_PASSWORD = 'Secret123!';
const NEW_PASSWORD = 'N3wSecret123!';

const regularUser = buildUser({
  id: 7,
  password: `hashed:${CURRENT_PASSWORD}`,
  updatedBy: null,
});

function buildHarness(options: { user?: UserEntity | null } = {}) {
  const events: string[] = [];

  const passwordHasher = mockOf<PasswordHasher>({
    hash: jest.fn((plain: string) => {
      events.push('hash');
      return Promise.resolve(`hashed:${plain}`);
    }),
    verify: jest.fn((hash: string, plain: string) =>
      Promise.resolve(hash === `hashed:${plain}`),
    ),
  });

  const runInTransaction = <T>(work: () => Promise<T>): Promise<T> => {
    events.push('begin');
    return work();
  };

  const findByIdForUpdate = jest.fn(() => {
    events.push('lock');
    return Promise.resolve(
      options.user === undefined ? regularUser : options.user,
    );
  });

  const update = jest.fn((user: UserEntity) => {
    events.push('update');
    return Promise.resolve(user);
  });

  const revokeTokens = jest.fn(() => {
    events.push('revoke-tokens');
    return Promise.resolve();
  });

  const revokeSessions = jest.fn(() => {
    events.push('revoke-sessions');
    return Promise.resolve();
  });

  const useCase = new ChangeOwnPasswordUseCase(
    mockOf<UserRepository>({ findByIdForUpdate, update }),
    { runInTransaction, runInSavepoint: (work) => work() },
    passwordHasher,
    mockOf<PasswordChangeTokenRevokerRegistry>({
      revokeAllForUser: revokeTokens,
    }),
    mockOf<UserSessionRevokerRegistry>({ revokeAllForUser: revokeSessions }),
  );

  return {
    useCase,
    events,
    findByIdForUpdate,
    update,
    revokeTokens,
    revokeSessions,
  };
}

describe('ChangeOwnPasswordUseCase', () => {
  it('hashes outside the transaction, locks the actor row, writes the new hash, and revokes reset tokens and every session', async () => {
    const {
      useCase,
      events,
      findByIdForUpdate,
      update,
      revokeTokens,
      revokeSessions,
    } = buildHarness();

    await useCase.execute({
      actorId: 7,
      currentPassword: CURRENT_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(events).toEqual([
      'hash',
      'begin',
      'lock',
      'update',
      'revoke-tokens',
      'revoke-sessions',
    ]);
    expect(findByIdForUpdate).toHaveBeenCalledWith(7);

    const [written] = update.mock.calls[0];
    expect(written.password).toBe(`hashed:${NEW_PASSWORD}`);
    expect(written.updatedBy).toBe(7);
    expect(written.email).toBe(regularUser.email);
    expect(written.emailConfirmedAt).toEqual(regularUser.emailConfirmedAt);

    expect(revokeTokens).toHaveBeenCalledWith(7);
    expect(revokeSessions).toHaveBeenCalledWith(7);
  });

  it('accepts a new password equal to the current one and still ends every session', async () => {
    const { useCase, update, revokeSessions } = buildHarness();

    await useCase.execute({
      actorId: 7,
      currentPassword: CURRENT_PASSWORD,
      newPassword: CURRENT_PASSWORD,
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(revokeSessions).toHaveBeenCalledWith(7);
  });

  it('rejects a wrong current password with InvalidCurrentPasswordError and changes nothing', async () => {
    const { useCase, update, revokeTokens, revokeSessions } = buildHarness();

    await expect(
      useCase.execute({
        actorId: 7,
        currentPassword: 'NotThePassword1!',
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(InvalidCurrentPasswordError);

    expect(update).not.toHaveBeenCalled();
    expect(revokeTokens).not.toHaveBeenCalled();
    expect(revokeSessions).not.toHaveBeenCalled();
  });

  it('verifies the current password against the locked row', async () => {
    const changedConcurrently = buildUser({
      id: 7,
      password: 'hashed:ChangedElsewhere1!',
    });

    const { useCase, update } = buildHarness({ user: changedConcurrently });

    await expect(
      useCase.execute({
        actorId: 7,
        currentPassword: CURRENT_PASSWORD,
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(InvalidCurrentPasswordError);

    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a missing actor with UserNotFoundError', async () => {
    const { useCase, update } = buildHarness({ user: null });

    await expect(
      useCase.execute({
        actorId: 7,
        currentPassword: CURRENT_PASSWORD,
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(UserNotFoundError);

    expect(update).not.toHaveBeenCalled();
  });

  it('rejects an inactive actor with InactiveUserError', async () => {
    const { useCase, update } = buildHarness({
      user: buildUser({
        id: 7,
        password: `hashed:${CURRENT_PASSWORD}`,
        status: RecordStatus.INACTIVE,
      }),
    });

    await expect(
      useCase.execute({
        actorId: 7,
        currentPassword: CURRENT_PASSWORD,
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(InactiveUserError);

    expect(update).not.toHaveBeenCalled();
  });

  it('propagates a revoker failure so the transaction rolls back', async () => {
    const { useCase, revokeSessions } = buildHarness();
    revokeSessions.mockRejectedValueOnce(new Error('db down'));

    await expect(
      useCase.execute({
        actorId: 7,
        currentPassword: CURRENT_PASSWORD,
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toThrow('db down');
  });
});
