import type { TokenHasher } from '@shared/application/ports';
import { RefreshTokenEntity } from '../../../domain/entities/refresh-token.entity';
import type { RefreshTokenRepository } from '../../../domain/repositories/refresh-token.repository';
import type { TokenService } from '../../ports/token-service.port';
import { IssueAuthTokensService } from '../issue-auth-tokens.service';
import { buildUser } from '@test/support/builders/user.builder';
import { mockOf } from '@test/support/mocks/mock-of';

describe('IssueAuthTokensService', () => {
  it('signs an access + refresh token pair, persists a hashed refresh token row, and returns the issued jti', async () => {
    const signAccessToken = jest.fn().mockReturnValue('access-token');
    const signRefreshToken = jest.fn().mockReturnValue('raw-refresh-token');
    const refreshTtlMs = jest.fn().mockReturnValue(604_800_000);

    const tokenService = mockOf<TokenService>({
      signAccessToken,
      signRefreshToken,
      verifyRefreshToken: jest.fn(),
      accessTtlMs: jest.fn(),
      refreshTtlMs,
    });

    const hash = jest.fn().mockReturnValue('hashed-refresh-token');

    const tokenHasher = mockOf<TokenHasher>({
      hash,
      verify: jest.fn(),
    });

    const create = jest
      .fn()
      .mockImplementation((entity: RefreshTokenEntity) =>
        Promise.resolve(entity),
      );

    const refreshTokenRepository = mockOf<RefreshTokenRepository>({
      create,
      findByUuid: jest.fn(),
      revokeAllForUser: jest.fn(),
    });

    const service = new IssueAuthTokensService(
      refreshTokenRepository,
      tokenService,
      tokenHasher,
    );

    const user = buildUser();
    const result = await service.issue(user);

    expect(signAccessToken).toHaveBeenCalledWith({
      sub: user.uuid,
      email: user.email,
      sid: result.sessionId,
    });
    expect(signRefreshToken).toHaveBeenCalledWith({
      sub: user.uuid,
      jti: result.refreshTokenUuid,
      sid: result.sessionId,
    });
    expect(hash).toHaveBeenCalledWith('raw-refresh-token');
    expect(create).toHaveBeenCalledTimes(1);

    const [persisted] = create.mock.calls[0] as [RefreshTokenEntity];

    expect(persisted.tokenHash).toBe('hashed-refresh-token');
    expect(persisted.tokenHash).not.toBe('raw-refresh-token');
    expect(persisted.userId).toBe(user.id);

    expect(result.user).toBe(user);
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('raw-refresh-token');
    expect(result.refreshTokenUuid).toBe(persisted.uuid);
  });

  it('mints a distinct jti on every call', async () => {
    const tokenService = mockOf<TokenService>({
      signAccessToken: jest.fn().mockReturnValue('access-token'),
      signRefreshToken: jest.fn().mockReturnValue('raw-refresh-token'),
      verifyRefreshToken: jest.fn(),
      accessTtlMs: jest.fn(),
      refreshTtlMs: jest.fn().mockReturnValue(1),
    });

    const tokenHasher = mockOf<TokenHasher>({
      hash: jest.fn().mockReturnValue('hashed'),
      verify: jest.fn(),
    });

    const refreshTokenRepository = mockOf<RefreshTokenRepository>({
      create: jest
        .fn()
        .mockImplementation((entity: RefreshTokenEntity) =>
          Promise.resolve(entity),
        ),
      findByUuid: jest.fn(),
      revokeAllForUser: jest.fn(),
    });

    const service = new IssueAuthTokensService(
      refreshTokenRepository,
      tokenService,
      tokenHasher,
    );

    const user = buildUser();
    const first = await service.issue(user);
    const second = await service.issue(user);

    expect(first.refreshTokenUuid).not.toBe(second.refreshTokenUuid);
    expect(first.sessionId).not.toBe(second.sessionId);
  });

  it('signs a given session id into both tokens, so rotation keeps the session', async () => {
    const signAccessToken = jest.fn().mockReturnValue('access-token');
    const signRefreshToken = jest.fn().mockReturnValue('raw-refresh-token');

    const tokenService = mockOf<TokenService>({
      signAccessToken,
      signRefreshToken,
      refreshTtlMs: jest.fn().mockReturnValue(1),
    });

    const service = new IssueAuthTokensService(
      mockOf<RefreshTokenRepository>({
        create: jest
          .fn()
          .mockImplementation((entity: RefreshTokenEntity) =>
            Promise.resolve(entity),
          ),
      }),
      tokenService,
      mockOf<TokenHasher>({ hash: jest.fn().mockReturnValue('hashed') }),
    );

    const result = await service.issue(buildUser(), 'session-1', 'jti-1');

    expect(result.sessionId).toBe('session-1');
    expect(signAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ sid: 'session-1' }),
    );
    expect(signRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({ jti: 'jti-1', sid: 'session-1' }),
    );
  });
});
