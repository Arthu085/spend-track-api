import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import type {
  TokenHasher,
  TransactionManagerPort,
} from '@shared/application/ports';
import { UserEntity } from '@modules/users/domain/entities/user.entity';
import type { UserRepository } from '@modules/users/domain/repositories/user.repository';
import { EmailNotConfirmedError } from '../../../domain/errors/email-not-confirmed.error';
import { RefreshTokenEntity } from '../../../domain/entities/refresh-token.entity';
import { InvalidRefreshTokenError } from '../../../domain/errors/invalid-refresh-token.error';
import type { RefreshTokenRepository } from '../../../domain/repositories/refresh-token.repository';
import type { TokenService } from '../../ports/token-service.port';
import type { IssueAuthTokensService } from '../../services/issue-auth-tokens.service';
import { RefreshTokensUseCase } from '../refresh-tokens.use-case';
import { buildUser } from '@test/support/builders/user.builder';
import { mockOf } from '@test/support/mocks/mock-of';

function buildUsableToken(): RefreshTokenEntity {
  return RefreshTokenEntity.reconstitute({
    id: 1,
    uuid: 'jti-1',
    userId: 1,
    sessionId: '5d1f6c1e-0b5a-4c8e-9a51-3f8e2b7c4d10',
    tokenHash: 'hashed-refresh-token',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    replacedByUuid: null,
    createdAt: new Date(),
  });
}

function buildRevokedToken(replacedByUuid: string | null): RefreshTokenEntity {
  return RefreshTokenEntity.reconstitute({
    id: 1,
    uuid: 'jti-1',
    userId: 1,
    sessionId: '5d1f6c1e-0b5a-4c8e-9a51-3f8e2b7c4d10',
    tokenHash: 'hashed-refresh-token',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: new Date(),
    replacedByUuid,
    createdAt: new Date(),
  });
}

interface DepsOverrides {
  verifyRefreshToken?: jest.Mock;
  findByUuid?: jest.Mock;
  verify?: jest.Mock;
  findByUuidUser?: jest.Mock;
  findByIdForUpdate?: jest.Mock;
  issue?: jest.Mock;
  revokeIfActive?: jest.Mock;
  revokeAllForUser?: jest.Mock;
  runInTransaction?: jest.Mock;
}

interface Deps {
  useCase: RefreshTokensUseCase;
  verifyRefreshToken: jest.Mock;
  revokeAllForUser: jest.Mock;
  revokeIfActive: jest.Mock;
  findByIdForUpdate: jest.Mock;
  issue: jest.Mock;
  runInTransaction: jest.Mock;
  verify: jest.Mock;
}

function buildDeps(overrides?: DepsOverrides): Deps {
  const verifyRefreshToken =
    overrides?.verifyRefreshToken ??
    jest
      .fn()
      .mockResolvedValue({ sub: 'user-uuid', jti: 'jti-1', sid: 'session-1' });

  const tokenService = mockOf<TokenService>({
    signAccessToken: jest.fn(),
    signRefreshToken: jest.fn(),
    verifyRefreshToken,
    accessTtlMs: jest.fn(),
    refreshTtlMs: jest.fn(),
  });

  const findByUuid =
    overrides?.findByUuid ?? jest.fn().mockResolvedValue(buildUsableToken());

  const revokeIfActive =
    overrides?.revokeIfActive ?? jest.fn().mockResolvedValue(true);

  const revokeAllForUser =
    overrides?.revokeAllForUser ?? jest.fn().mockResolvedValue(undefined);

  const refreshTokenRepository = mockOf<RefreshTokenRepository>({
    create: jest.fn(),
    findByUuid,
    revokeIfActive,
    revokeAllForUser,
  });

  const findByIdForUpdate =
    overrides?.findByIdForUpdate ?? jest.fn().mockResolvedValue(buildUser());

  const userRepository = mockOf<UserRepository>({
    findByUuid:
      overrides?.findByUuidUser ?? jest.fn().mockResolvedValue(buildUser()),
    findByIdForUpdate,
  });

  const verify = overrides?.verify ?? jest.fn().mockReturnValue(true);

  const tokenHasher = mockOf<TokenHasher>({
    hash: jest.fn(),
    verify,
  });

  const issue =
    overrides?.issue ??
    jest.fn().mockResolvedValue({
      user: buildUser(),
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      sessionId: 'session-1',
      refreshTokenUuid: 'jti-2',
    });

  const issueAuthTokens = mockOf<IssueAuthTokensService>({ issue });

  const runInTransaction =
    overrides?.runInTransaction ??
    jest.fn().mockImplementation((work: () => Promise<unknown>) => work());

  const transactionManager = mockOf<TransactionManagerPort>({
    runInTransaction,
  });

  const useCase = new RefreshTokensUseCase(
    tokenService,
    refreshTokenRepository,
    userRepository,
    tokenHasher,
    issueAuthTokens,
    transactionManager,
  );

  return {
    useCase,
    verifyRefreshToken,
    revokeAllForUser,
    revokeIfActive,
    findByIdForUpdate,
    issue,
    runInTransaction,
    verify,
  };
}

describe('RefreshTokensUseCase', () => {
  it('throws InvalidRefreshTokenError when no refresh token cookie was sent', async () => {
    const { useCase, verifyRefreshToken } = buildDeps();

    await expect(
      useCase.execute({ refreshToken: undefined }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    expect(verifyRefreshToken).not.toHaveBeenCalled();
  });

  it('throws InvalidRefreshTokenError for a garbage/unverifiable token', async () => {
    const { useCase } = buildDeps({
      verifyRefreshToken: jest.fn().mockResolvedValue(null),
    });

    await expect(
      useCase.execute({ refreshToken: 'garbage' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('throws InvalidRefreshTokenError when the jti is unknown', async () => {
    const { useCase } = buildDeps({
      findByUuid: jest.fn().mockResolvedValue(null),
    });

    await expect(
      useCase.execute({ refreshToken: 'a-valid-jwt' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it.each([
    ['rotated', 'jti-2'],
    ['revoked without a replacement', null],
  ])(
    'revokes every token for the user when a %s token is replayed',
    async (_label, replacedByUuid) => {
      const { useCase, revokeAllForUser, revokeIfActive, issue } = buildDeps({
        findByUuid: jest
          .fn()
          .mockResolvedValue(buildRevokedToken(replacedByUuid)),
      });

      await expect(
        useCase.execute({ refreshToken: 'a-valid-jwt' }),
      ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

      expect(revokeAllForUser).toHaveBeenCalledWith(1);
      expect(revokeIfActive).not.toHaveBeenCalled();
      expect(issue).not.toHaveBeenCalled();
    },
  );

  it('does not revoke other sessions when the stored row is merely expired', async () => {
    const expired = RefreshTokenEntity.reconstitute({
      id: 1,
      uuid: 'jti-1',
      userId: 1,
      sessionId: '5d1f6c1e-0b5a-4c8e-9a51-3f8e2b7c4d10',
      tokenHash: 'hashed-refresh-token',
      expiresAt: new Date(Date.now() - 1),
      revokedAt: null,
      replacedByUuid: null,
      createdAt: new Date(),
    });

    const { useCase, revokeAllForUser } = buildDeps({
      findByUuid: jest.fn().mockResolvedValue(expired),
    });

    await expect(
      useCase.execute({ refreshToken: 'a-valid-jwt' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    expect(revokeAllForUser).not.toHaveBeenCalled();
  });

  it('throws InvalidRefreshTokenError and revokes every token for the user on a hash mismatch (possible reuse/theft)', async () => {
    const { useCase, revokeAllForUser } = buildDeps({
      verify: jest.fn().mockReturnValue(false),
    });

    await expect(
      useCase.execute({ refreshToken: 'a-valid-jwt' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    expect(revokeAllForUser).toHaveBeenCalledWith(1);
  });

  it('throws InvalidRefreshTokenError when the user no longer exists', async () => {
    const { useCase } = buildDeps({
      findByUuidUser: jest.fn().mockResolvedValue(null),
    });

    await expect(
      useCase.execute({ refreshToken: 'a-valid-jwt' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('throws InvalidRefreshTokenError when the token belongs to a different user than the JWT subject', async () => {
    const otherUser = buildUser({ id: 2 });

    const { useCase, issue } = buildDeps({
      findByUuidUser: jest.fn().mockResolvedValue(otherUser),
    });

    await expect(
      useCase.execute({ refreshToken: 'a-valid-jwt' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    expect(issue).not.toHaveBeenCalled();
  });

  it('throws InvalidRefreshTokenError when the user is INACTIVE', async () => {
    const { useCase } = buildDeps({
      findByUuidUser: jest
        .fn()
        .mockResolvedValue(buildUser({ status: RecordStatus.INACTIVE })),
    });

    await expect(
      useCase.execute({ refreshToken: 'a-valid-jwt' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('throws EmailNotConfirmedError when the user is ACTIVE but has never confirmed their email', async () => {
    const { useCase } = buildDeps({
      findByUuidUser: jest
        .fn()
        .mockResolvedValue(buildUser({ emailConfirmedAt: null })),
    });

    await expect(
      useCase.execute({ refreshToken: 'a-valid-jwt' }),
    ).rejects.toBeInstanceOf(EmailNotConfirmedError);
  });

  it('rotates the token on the happy path: claims the old row for a new jti and issues tokens under that same jti and session', async () => {
    const { useCase, issue, revokeIfActive, verify } = buildDeps();

    const result = await useCase.execute({ refreshToken: 'a-valid-jwt' });

    expect(verify).toHaveBeenCalledWith('hashed-refresh-token', 'a-valid-jwt');
    expect(revokeIfActive).toHaveBeenCalledTimes(1);
    expect(issue).toHaveBeenCalledTimes(1);

    const [revokedUuid, replacementUuid] = revokeIfActive.mock.calls[0] as [
      string,
      string,
    ];

    const [, issuedSessionId, issuedJti] = issue.mock.calls[0] as [
      UserEntity,
      string,
      string,
    ];

    expect(revokedUuid).toBe('jti-1');
    expect(issuedJti).toBe(replacementUuid);
    expect(issuedSessionId).toBe('session-1');
    expect(result.sessionId).toBe('session-1');
    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshToken).toBe('new-refresh-token');
  });

  it('locks the user row before claiming the token and issues for the locked re-read', async () => {
    const lockedUser = buildUser({ name: 'Locked Re-read' });

    const { useCase, findByIdForUpdate, revokeIfActive, issue } = buildDeps({
      findByIdForUpdate: jest.fn().mockResolvedValue(lockedUser),
    });

    await useCase.execute({ refreshToken: 'a-valid-jwt' });

    expect(findByIdForUpdate).toHaveBeenCalledWith(1);
    expect(findByIdForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      revokeIfActive.mock.invocationCallOrder[0],
    );
    expect(issue).toHaveBeenCalledWith(
      lockedUser,
      expect.any(String),
      expect.any(String),
    );
  });

  it.each([
    ['deactivated', buildUser({ status: RecordStatus.INACTIVE })],
    ['deleted', null],
  ])(
    'claims nothing and revokes nothing when the user was %s before the row lock was taken',
    async (_label, lockedUser) => {
      const { useCase, revokeIfActive, revokeAllForUser, issue } = buildDeps({
        findByIdForUpdate: jest.fn().mockResolvedValue(lockedUser),
      });

      await expect(
        useCase.execute({ refreshToken: 'a-valid-jwt' }),
      ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

      expect(revokeIfActive).not.toHaveBeenCalled();
      expect(revokeAllForUser).not.toHaveBeenCalled();
      expect(issue).not.toHaveBeenCalled();
    },
  );

  it('throws EmailNotConfirmedError and claims nothing when an email change unconfirmed the user before the row lock was taken', async () => {
    const { useCase, revokeIfActive, revokeAllForUser, issue } = buildDeps({
      findByIdForUpdate: jest
        .fn()
        .mockResolvedValue(buildUser({ emailConfirmedAt: null })),
    });

    await expect(
      useCase.execute({ refreshToken: 'a-valid-jwt' }),
    ).rejects.toBeInstanceOf(EmailNotConfirmedError);

    expect(revokeIfActive).not.toHaveBeenCalled();
    expect(revokeAllForUser).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
  });

  it('revokes every session under the user row lock when reuse is detected', async () => {
    const { useCase, findByIdForUpdate, revokeAllForUser, runInTransaction } =
      buildDeps({ verify: jest.fn().mockReturnValue(false) });

    await expect(
      useCase.execute({ refreshToken: 'a-valid-jwt' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    expect(runInTransaction).toHaveBeenCalledTimes(1);
    expect(findByIdForUpdate).toHaveBeenCalledWith(1);
    expect(findByIdForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      revokeAllForUser.mock.invocationCallOrder[0],
    );
  });

  it('revokes every token for the user and issues nothing when a concurrent request already rotated the token', async () => {
    const { useCase, issue, revokeAllForUser } = buildDeps({
      revokeIfActive: jest.fn().mockResolvedValue(false),
    });

    await expect(
      useCase.execute({ refreshToken: 'a-valid-jwt' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    expect(issue).not.toHaveBeenCalled();
    expect(revokeAllForUser).toHaveBeenCalledWith(1);
  });

  it('issues and revokes inside one transaction and returns the result from outside it', async () => {
    const { useCase, runInTransaction } = buildDeps();

    const result = await useCase.execute({ refreshToken: 'a-valid-jwt' });

    expect(runInTransaction).toHaveBeenCalledTimes(1);
    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshToken).toBe('new-refresh-token');
  });

  it('performs no token write outside the transaction', async () => {
    // A stub that never invokes its callback still has to resolve with the
    // shape the use-case destructures, so the escaping AuthResult is proven
    // to come from the transaction's return value, not from a write made
    // before/after it.
    const nonInvokingRunInTransaction = jest.fn().mockResolvedValue({
      user: buildUser(),
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      refreshTokenUuid: 'jti-2',
    });

    const { useCase, issue, revokeIfActive } = buildDeps({
      runInTransaction: nonInvokingRunInTransaction,
    });

    await useCase.execute({ refreshToken: 'a-valid-jwt' });

    expect(issue).not.toHaveBeenCalled();
    expect(revokeIfActive).not.toHaveBeenCalled();
  });
});
