import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import type {
  TokenHasher,
  TransactionManagerPort,
} from '@shared/application/ports';
import { UserEntity } from '@modules/users/domain/entities/user.entity';
import type { UserRepository } from '@modules/users/domain/repositories/user.repository';
import type { PasswordHasher } from '@modules/users/application/ports/password-hasher.port';
import { PasswordResetTokenEntity } from '../../../domain/entities/password-reset-token.entity';
import { InvalidPasswordResetTokenError } from '../../../domain/errors/invalid-password-reset-token.error';
import type { PasswordResetTokenRepository } from '../../../domain/repositories/password-reset-token.repository';
import type { RefreshTokenRepository } from '../../../domain/repositories/refresh-token.repository';
import { ResetPasswordUseCase } from '../reset-password.use-case';
import { buildUser } from '@test/support/builders/user.builder';
import { mockOf } from '@test/support/mocks/mock-of';

const TOKEN_UUID = '0b9f3c2e-6a51-4d7e-9c1a-2f4b8e6d1a37';
const UNKNOWN_UUID = '5d2a7c41-8e3f-4b6a-a9d0-7c1e3f5b2d84';

const MALFORMED_TOKENS = [
  'no-dot-here',
  `${TOKEN_UUID}.`,
  '.secret',
  `${TOKEN_UUID}.secret.extra`,
  'not-a-uuid.secret',
];

function buildToken(
  overrides: Partial<{ consumedAt: Date | null; expiresAt: Date }> = {},
): PasswordResetTokenEntity {
  return PasswordResetTokenEntity.reconstitute({
    id: 1,
    uuid: TOKEN_UUID,
    userId: 1,
    tokenHash: 'hashed-secret',
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
    consumedAt: overrides.consumedAt ?? null,
    createdAt: new Date(),
  });
}

interface DepsOverrides {
  findByUuid?: jest.Mock;
  verify?: jest.Mock;
  findUser?: jest.Mock;
  findLockedUser?: jest.Mock;
  consumeIfUnconsumed?: jest.Mock;
  runInTransaction?: jest.Mock;
}

function buildDeps(overrides: DepsOverrides = {}) {
  const findByUuid =
    overrides.findByUuid ?? jest.fn().mockResolvedValue(buildToken());

  const consumeIfUnconsumed =
    overrides.consumeIfUnconsumed ?? jest.fn().mockResolvedValue(true);

  const consumeAllForUser = jest.fn().mockResolvedValue(undefined);

  const tokenRepository = mockOf<PasswordResetTokenRepository>({
    create: jest.fn(),
    findByUuid,
    consumeIfUnconsumed,
    consumeAllForUser,
  });

  const findUser =
    overrides.findUser ??
    jest.fn().mockResolvedValue(buildUser({ emailConfirmedAt: null }));

  // The row re-read under lock inside the transaction; by default it matches
  // the pre-check snapshot.
  const findLockedUser =
    overrides.findLockedUser ??
    jest.fn().mockResolvedValue(buildUser({ emailConfirmedAt: null }));

  const updateUser = jest.fn().mockResolvedValue(undefined);

  const userRepository = mockOf<UserRepository>({
    findById: findUser,
    findByIdForUpdate: findLockedUser,
    update: updateUser,
  });

  const hash = jest.fn().mockResolvedValue('new-hashed-password');
  const passwordVerify = jest.fn();

  const passwordHasher = mockOf<PasswordHasher>({
    hash,
    verify: passwordVerify,
  });

  const verify = overrides.verify ?? jest.fn().mockReturnValue(true);

  const tokenHasher = mockOf<TokenHasher>({ hash: jest.fn(), verify });

  const revokeAllForUser = jest.fn().mockResolvedValue(undefined);

  const refreshTokenRepository = mockOf<RefreshTokenRepository>({
    revokeAllForUser,
  });

  const runInTransaction =
    overrides.runInTransaction ??
    jest.fn().mockImplementation((work: () => Promise<unknown>) => work());

  const transactionManager = mockOf<TransactionManagerPort>({
    runInTransaction,
  });

  const useCase = new ResetPasswordUseCase(
    tokenRepository,
    userRepository,
    passwordHasher,
    tokenHasher,
    refreshTokenRepository,
    transactionManager,
  );

  return {
    useCase,
    findByUuid,
    consumeIfUnconsumed,
    consumeAllForUser,
    updateUser,
    revokeAllForUser,
    hash,
    verify,
    passwordVerify,
    runInTransaction,
    findLockedUser,
  };
}

describe('ResetPasswordUseCase', () => {
  it('persists the new password hash, confirms the email, consumes tokens, and revokes every session on the happy path', async () => {
    const {
      useCase,
      findByUuid,
      updateUser,
      consumeIfUnconsumed,
      consumeAllForUser,
      revokeAllForUser,
      hash,
      verify,
      passwordVerify,
    } = buildDeps();

    await useCase.execute({
      token: `${TOKEN_UUID}.secret`,
      password: 'NewStrongPass123!',
    });

    expect(findByUuid).toHaveBeenCalledWith(TOKEN_UUID);
    expect(verify).toHaveBeenCalledWith('hashed-secret', 'secret');
    expect(passwordVerify).not.toHaveBeenCalled();
    expect(hash).toHaveBeenCalledWith('NewStrongPass123!');

    const [updatedUser] = updateUser.mock.calls[0] as [UserEntity];
    expect(updatedUser.password).toBe('new-hashed-password');
    expect(updatedUser.emailConfirmedAt).toBeInstanceOf(Date);

    expect(consumeIfUnconsumed).toHaveBeenCalledWith(TOKEN_UUID);
    expect(consumeAllForUser).toHaveBeenCalledWith(1);
    expect(revokeAllForUser).toHaveBeenCalledTimes(1);
    expect(revokeAllForUser).toHaveBeenCalledWith(1);
  });

  it('records the user as the updater of their own password reset', async () => {
    const { useCase, updateUser } = buildDeps();

    await useCase.execute({
      token: `${TOKEN_UUID}.secret`,
      password: 'NewStrongPass123!',
    });

    const [updatedUser] = updateUser.mock.calls[0] as [UserEntity];
    expect(updatedUser.updatedBy).toBe(1);
  });

  it('keeps the original confirmation timestamp of an already confirmed user', async () => {
    const confirmedAt = new Date('2026-01-01T00:00:00.000Z');

    const { useCase, updateUser } = buildDeps({
      findUser: jest
        .fn()
        .mockResolvedValue(buildUser({ emailConfirmedAt: confirmedAt })),
      findLockedUser: jest
        .fn()
        .mockResolvedValue(buildUser({ emailConfirmedAt: confirmedAt })),
    });

    await useCase.execute({
      token: `${TOKEN_UUID}.secret`,
      password: 'NewStrongPass123!',
    });

    const [updatedUser] = updateUser.mock.calls[0] as [UserEntity];
    expect(updatedUser.password).toBe('new-hashed-password');
    expect(updatedUser.emailConfirmedAt).toBe(confirmedAt);
  });

  it.each(MALFORMED_TOKENS)(
    'throws InvalidPasswordResetTokenError for the malformed token %p without a lookup',
    async (token) => {
      const { useCase, findByUuid, updateUser, revokeAllForUser } = buildDeps();

      await expect(
        useCase.execute({ token, password: 'NewStrongPass123!' }),
      ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
      expect(findByUuid).not.toHaveBeenCalled();
      expect(updateUser).not.toHaveBeenCalled();
      expect(revokeAllForUser).not.toHaveBeenCalled();
    },
  );

  it('throws InvalidPasswordResetTokenError when the uuid is unknown', async () => {
    const { useCase } = buildDeps({
      findByUuid: jest.fn().mockResolvedValue(null),
    });

    await expect(
      useCase.execute({
        token: `${UNKNOWN_UUID}.secret`,
        password: 'NewStrongPass123!',
      }),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
  });

  it('throws InvalidPasswordResetTokenError when the secret hash does not match', async () => {
    const { useCase, revokeAllForUser } = buildDeps({
      verify: jest.fn().mockReturnValue(false),
    });

    await expect(
      useCase.execute({
        token: `${TOKEN_UUID}.wrong-secret`,
        password: 'NewStrongPass123!',
      }),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
    expect(revokeAllForUser).not.toHaveBeenCalled();
  });

  it('throws InvalidPasswordResetTokenError when the token is expired', async () => {
    const { useCase } = buildDeps({
      findByUuid: jest
        .fn()
        .mockResolvedValue(buildToken({ expiresAt: new Date(Date.now() - 1) })),
    });

    await expect(
      useCase.execute({
        token: `${TOKEN_UUID}.secret`,
        password: 'NewStrongPass123!',
      }),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
  });

  it('throws InvalidPasswordResetTokenError when the token was already consumed', async () => {
    const { useCase } = buildDeps({
      findByUuid: jest
        .fn()
        .mockResolvedValue(buildToken({ consumedAt: new Date() })),
    });

    await expect(
      useCase.execute({
        token: `${TOKEN_UUID}.secret`,
        password: 'NewStrongPass123!',
      }),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
  });

  it('throws InvalidPasswordResetTokenError when the token references a user that no longer exists', async () => {
    const { useCase } = buildDeps({
      findUser: jest.fn().mockResolvedValue(null),
    });

    await expect(
      useCase.execute({
        token: `${TOKEN_UUID}.secret`,
        password: 'NewStrongPass123!',
      }),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
  });

  it('throws InvalidPasswordResetTokenError without hashing or writing when the user is inactive', async () => {
    const {
      useCase,
      hash,
      updateUser,
      consumeIfUnconsumed,
      consumeAllForUser,
      revokeAllForUser,
      runInTransaction,
    } = buildDeps({
      findUser: jest
        .fn()
        .mockResolvedValue(buildUser({ status: RecordStatus.INACTIVE })),
    });

    await expect(
      useCase.execute({
        token: `${TOKEN_UUID}.secret`,
        password: 'NewStrongPass123!',
      }),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
    expect(hash).not.toHaveBeenCalled();
    expect(runInTransaction).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
    expect(consumeIfUnconsumed).not.toHaveBeenCalled();
    expect(consumeAllForUser).not.toHaveBeenCalled();
    expect(revokeAllForUser).not.toHaveBeenCalled();
  });

  it('throws InvalidPasswordResetTokenError before the remaining writes when a concurrent request already consumed the token', async () => {
    const { useCase, consumeAllForUser, revokeAllForUser } = buildDeps({
      consumeIfUnconsumed: jest.fn().mockResolvedValue(false),
    });

    await expect(
      useCase.execute({
        token: `${TOKEN_UUID}.secret`,
        password: 'NewStrongPass123!',
      }),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
    expect(consumeAllForUser).not.toHaveBeenCalled();
    expect(revokeAllForUser).not.toHaveBeenCalled();
  });

  it('runs the whole write block inside a single transaction', async () => {
    const { useCase, runInTransaction } = buildDeps();

    await useCase.execute({
      token: `${TOKEN_UUID}.secret`,
      password: 'NewStrongPass123!',
    });

    expect(runInTransaction).toHaveBeenCalledTimes(1);
  });

  it('performs no write outside the transaction', async () => {
    // A stub that never invokes its callback proves every write happens
    // strictly inside runInTransaction, not before or after it.
    const nonInvokingRunInTransaction = jest.fn().mockResolvedValue(undefined);

    const {
      useCase,
      updateUser,
      consumeIfUnconsumed,
      consumeAllForUser,
      revokeAllForUser,
    } = buildDeps({ runInTransaction: nonInvokingRunInTransaction });

    await useCase.execute({
      token: `${TOKEN_UUID}.secret`,
      password: 'NewStrongPass123!',
    });

    expect(updateUser).not.toHaveBeenCalled();
    expect(consumeIfUnconsumed).not.toHaveBeenCalled();
    expect(consumeAllForUser).not.toHaveBeenCalled();
    expect(revokeAllForUser).not.toHaveBeenCalled();
  });

  it('writes the password onto the row re-read under lock, never the stale pre-check snapshot', async () => {
    const { useCase, updateUser, findLockedUser } = buildDeps({
      findUser: jest
        .fn()
        .mockResolvedValue(
          buildUser({ email: 'old@example.com', emailConfirmedAt: null }),
        ),
      findLockedUser: jest
        .fn()
        .mockResolvedValue(
          buildUser({ email: 'new@example.com', emailConfirmedAt: null }),
        ),
    });

    await useCase.execute({
      token: `${TOKEN_UUID}.secret`,
      password: 'NewStrongPass123!',
    });

    expect(findLockedUser).toHaveBeenCalledWith(1);

    const [updatedUser] = updateUser.mock.calls[0] as [UserEntity];
    expect(updatedUser.email).toBe('new@example.com');
  });

  it.each([
    {
      scenario: 'deactivated',
      locked: buildUser({ status: RecordStatus.INACTIVE }),
    },
    { scenario: 'deleted', locked: null },
  ])(
    'throws InvalidPasswordResetTokenError without any write when the user was $scenario after the pre-check',
    async ({ locked }) => {
      const {
        useCase,
        updateUser,
        consumeIfUnconsumed,
        consumeAllForUser,
        revokeAllForUser,
      } = buildDeps({ findLockedUser: jest.fn().mockResolvedValue(locked) });

      await expect(
        useCase.execute({
          token: `${TOKEN_UUID}.secret`,
          password: 'NewStrongPass123!',
        }),
      ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
      expect(updateUser).not.toHaveBeenCalled();
      expect(consumeIfUnconsumed).not.toHaveBeenCalled();
      expect(consumeAllForUser).not.toHaveBeenCalled();
      expect(revokeAllForUser).not.toHaveBeenCalled();
    },
  );
});
