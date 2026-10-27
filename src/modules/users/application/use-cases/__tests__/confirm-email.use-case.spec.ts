import type {
  TokenHasher,
  TransactionManagerPort,
} from '@shared/application/ports';
import { UserEntity } from '../../../domain/entities/user.entity';
import { EmailConfirmationTokenEntity } from '../../../domain/entities/email-confirmation-token.entity';
import type { EmailConfirmationTokenRepository } from '../../../domain/repositories/email-confirmation-token.repository';
import type { UserRepository } from '../../../domain/repositories/user.repository';
import { InvalidEmailConfirmationTokenError } from '../../../domain/errors/invalid-email-confirmation-token.error';
import { ConfirmEmailUseCase } from '../confirm-email.use-case';
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
  overrides: Partial<{
    consumedAt: Date | null;
    expiresAt: Date;
  }> = {},
): EmailConfirmationTokenEntity {
  return EmailConfirmationTokenEntity.reconstitute({
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
  updateUser?: jest.Mock;
  consumeIfUnconsumed?: jest.Mock;
  runInTransaction?: jest.Mock;
}

function buildDeps(overrides: DepsOverrides = {}) {
  const findByUuid =
    overrides.findByUuid ?? jest.fn().mockResolvedValue(buildToken());

  const consumeIfUnconsumed =
    overrides.consumeIfUnconsumed ?? jest.fn().mockResolvedValue(true);

  const tokenRepository = mockOf<EmailConfirmationTokenRepository>({
    create: jest.fn(),
    findByUuid,
    consumeIfUnconsumed,
    consumeAllForUser: jest.fn(),
  });

  const findUser =
    overrides.findUser ??
    jest.fn().mockResolvedValue(buildUser({ emailConfirmedAt: null }));

  const updateUser =
    overrides.updateUser ?? jest.fn().mockResolvedValue(undefined);

  const userRepository = mockOf<UserRepository>({
    findByIdForUpdate: findUser,
    update: updateUser,
  });

  const verify = overrides.verify ?? jest.fn().mockReturnValue(true);

  const tokenHasher = mockOf<TokenHasher>({
    hash: jest.fn(),
    verify,
  });

  const runInTransaction =
    overrides.runInTransaction ??
    jest.fn().mockImplementation((work: () => Promise<unknown>) => work());

  const transactionManager = mockOf<TransactionManagerPort>({
    runInTransaction,
  });

  const useCase = new ConfirmEmailUseCase(
    tokenRepository,
    userRepository,
    tokenHasher,
    transactionManager,
  );

  return {
    useCase,
    findByUuid,
    consumeIfUnconsumed,
    findUser,
    updateUser,
    verify,
    runInTransaction,
  };
}

describe('ConfirmEmailUseCase', () => {
  it('confirms the user email and consumes the token on the happy path', async () => {
    const {
      useCase,
      findByUuid,
      updateUser,
      consumeIfUnconsumed,
      runInTransaction,
      verify,
    } = buildDeps();

    await useCase.execute({ token: `${TOKEN_UUID}.secret` });

    expect(findByUuid).toHaveBeenCalledWith(TOKEN_UUID);
    expect(verify).toHaveBeenCalledWith('hashed-secret', 'secret');
    expect(runInTransaction).toHaveBeenCalledTimes(1);
    expect(consumeIfUnconsumed).toHaveBeenCalledWith(TOKEN_UUID);
    expect(updateUser).toHaveBeenCalledTimes(1);

    const [updatedUser] = updateUser.mock.calls[0] as [UserEntity];
    expect(updatedUser.emailConfirmedAt).toBeInstanceOf(Date);
  });

  it('throws InvalidEmailConfirmationTokenError without confirming the user when a concurrent request already consumed the token', async () => {
    const { useCase, updateUser } = buildDeps({
      consumeIfUnconsumed: jest.fn().mockResolvedValue(false),
    });

    await expect(
      useCase.execute({ token: `${TOKEN_UUID}.secret` }),
    ).rejects.toBeInstanceOf(InvalidEmailConfirmationTokenError);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it.each(MALFORMED_TOKENS)(
    'throws InvalidEmailConfirmationTokenError for the malformed token %p without a lookup',
    async (token) => {
      const { useCase, findByUuid } = buildDeps();

      await expect(useCase.execute({ token })).rejects.toBeInstanceOf(
        InvalidEmailConfirmationTokenError,
      );
      expect(findByUuid).not.toHaveBeenCalled();
    },
  );

  it('throws InvalidEmailConfirmationTokenError when the uuid is unknown', async () => {
    const { useCase } = buildDeps({
      findByUuid: jest.fn().mockResolvedValue(null),
    });

    await expect(
      useCase.execute({ token: `${UNKNOWN_UUID}.secret` }),
    ).rejects.toBeInstanceOf(InvalidEmailConfirmationTokenError);
  });

  it('throws InvalidEmailConfirmationTokenError when the token secret hash does not match', async () => {
    const { useCase, updateUser } = buildDeps({
      verify: jest.fn().mockReturnValue(false),
    });

    await expect(
      useCase.execute({ token: `${TOKEN_UUID}.wrong-secret` }),
    ).rejects.toBeInstanceOf(InvalidEmailConfirmationTokenError);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('throws InvalidEmailConfirmationTokenError when the token is already expired', async () => {
    const { useCase } = buildDeps({
      findByUuid: jest
        .fn()
        .mockResolvedValue(buildToken({ expiresAt: new Date(Date.now() - 1) })),
    });

    await expect(
      useCase.execute({ token: `${TOKEN_UUID}.secret` }),
    ).rejects.toBeInstanceOf(InvalidEmailConfirmationTokenError);
  });

  it('throws InvalidEmailConfirmationTokenError when the token was already consumed', async () => {
    const { useCase } = buildDeps({
      findByUuid: jest
        .fn()
        .mockResolvedValue(buildToken({ consumedAt: new Date() })),
    });

    await expect(
      useCase.execute({ token: `${TOKEN_UUID}.secret` }),
    ).rejects.toBeInstanceOf(InvalidEmailConfirmationTokenError);
  });

  it('throws InvalidEmailConfirmationTokenError when the token references a user that no longer exists', async () => {
    const { useCase } = buildDeps({
      findUser: jest.fn().mockResolvedValue(null),
    });

    await expect(
      useCase.execute({ token: `${TOKEN_UUID}.secret` }),
    ).rejects.toBeInstanceOf(InvalidEmailConfirmationTokenError);
  });

  it('is idempotent: an already-confirmed user still succeeds and still consumes the token, without a redundant user update', async () => {
    const { useCase, updateUser, consumeIfUnconsumed } = buildDeps({
      findUser: jest.fn().mockResolvedValue(buildUser()),
    });

    await useCase.execute({ token: `${TOKEN_UUID}.secret` });

    expect(updateUser).not.toHaveBeenCalled();
    expect(consumeIfUnconsumed).toHaveBeenCalledTimes(1);
  });

  it('locks and reads the owning user inside the transaction, before claiming the token', async () => {
    const events: string[] = [];

    const { useCase, findUser } = buildDeps({
      findUser: jest.fn().mockImplementation(() => {
        events.push('lock-user');
        return Promise.resolve(buildUser({ emailConfirmedAt: null }));
      }),
      consumeIfUnconsumed: jest.fn().mockImplementation(() => {
        events.push('claim-token');
        return Promise.resolve(true);
      }),
      runInTransaction: jest
        .fn()
        .mockImplementation(async (work: () => Promise<unknown>) => {
          events.push('begin');
          await work();
          events.push('commit');
        }),
    });

    await useCase.execute({ token: `${TOKEN_UUID}.secret` });

    expect(findUser).toHaveBeenCalledWith(1);
    expect(events).toEqual(['begin', 'lock-user', 'claim-token', 'commit']);
  });

  it('confirms the row re-read under lock, keeping the address it holds now', async () => {
    const updateUser = jest.fn().mockResolvedValue(undefined);

    const { useCase } = buildDeps({
      updateUser,
      findUser: jest
        .fn()
        .mockResolvedValue(
          buildUser({ email: 'current@example.com', emailConfirmedAt: null }),
        ),
    });

    await useCase.execute({ token: `${TOKEN_UUID}.secret` });

    const [confirmed] = updateUser.mock.calls[0] as [UserEntity];
    expect(confirmed.email).toBe('current@example.com');
    expect(confirmed.emailConfirmedAt).toBeInstanceOf(Date);
  });
});
