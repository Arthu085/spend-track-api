import { JwtService } from '@nestjs/jwt';
import type { AppConfigService } from '@core/config';
import { NestJwtTokenService } from '../nest-jwt-token.service';

function buildConfig(
  secrets: { accessSecret: string; refreshSecret: string } = {
    accessSecret: 'access-secret',
    refreshSecret: 'refresh-secret',
  },
): AppConfigService {
  return {
    jwt: {
      accessSecret: secrets.accessSecret,
      accessTtl: '15m',
      refreshSecret: secrets.refreshSecret,
      refreshTtl: '7d',
    },
  } as unknown as AppConfigService;
}

// Both kinds share one secret so these tests prove the kind claims, not secret separation, reject a
// token of the wrong kind.
const SHARED_SECRET_CONFIG = buildConfig({
  accessSecret: 'shared-secret',
  refreshSecret: 'shared-secret',
});

describe('NestJwtTokenService', () => {
  it('signs the access token with the access secret, TTL (in seconds), HS256 and the access kind claims', () => {
    const sign = jest.fn().mockReturnValue('signed-access-token');
    const jwtService = { sign } as unknown as JwtService;

    const service = new NestJwtTokenService(jwtService, buildConfig());

    const token = service.signAccessToken({
      sub: 'uuid-1',
      email: 'a@b.com',
      sid: 'session-1',
    });

    expect(token).toBe('signed-access-token');
    expect(sign).toHaveBeenCalledWith(
      { sub: 'uuid-1', email: 'a@b.com', sid: 'session-1', typ: 'access' },
      {
        secret: 'access-secret',
        expiresIn: 15 * 60,
        algorithm: 'HS256',
        audience: 'auth:access',
      },
    );
  });

  it('signs the refresh token with the refresh secret, TTL (in seconds), HS256 and the refresh kind claims', () => {
    const sign = jest.fn().mockReturnValue('signed-refresh-token');
    const jwtService = { sign } as unknown as JwtService;

    const service = new NestJwtTokenService(jwtService, buildConfig());

    const token = service.signRefreshToken({
      sub: 'uuid-1',
      jti: 'jti-1',
      sid: 'session-1',
    });

    expect(token).toBe('signed-refresh-token');
    expect(sign).toHaveBeenCalledWith(
      { sub: 'uuid-1', jti: 'jti-1', sid: 'session-1', typ: 'refresh' },
      {
        secret: 'refresh-secret',
        expiresIn: 7 * 24 * 60 * 60,
        algorithm: 'HS256',
        audience: 'auth:refresh',
      },
    );
  });

  it('verifyRefreshToken verifies against the refresh secret, pinned to HS256 and the refresh audience', async () => {
    const verifyAsync = jest.fn().mockResolvedValue({
      sub: 'uuid-1',
      jti: 'jti-1',
      sid: 'session-1',
      typ: 'refresh',
    });

    const jwtService = { verifyAsync } as unknown as JwtService;

    const service = new NestJwtTokenService(jwtService, buildConfig());

    const payload = await service.verifyRefreshToken('a-refresh-token');

    expect(verifyAsync).toHaveBeenCalledWith('a-refresh-token', {
      secret: 'refresh-secret',
      algorithms: ['HS256'],
      audience: 'auth:refresh',
    });
    expect(payload).toEqual({
      sub: 'uuid-1',
      jti: 'jti-1',
      sid: 'session-1',
      typ: 'refresh',
    });
  });

  it('verifyAccessToken verifies against the access secret, pinned to HS256 and the access audience', async () => {
    const verifyAsync = jest.fn().mockResolvedValue({
      sub: 'uuid-1',
      email: 'a@b.com',
      sid: 'session-1',
      typ: 'access',
    });

    const jwtService = { verifyAsync } as unknown as JwtService;

    const service = new NestJwtTokenService(jwtService, buildConfig());

    const payload = await service.verifyAccessToken('an-access-token');

    expect(verifyAsync).toHaveBeenCalledWith('an-access-token', {
      secret: 'access-secret',
      algorithms: ['HS256'],
      audience: 'auth:access',
    });
    expect(payload).toMatchObject({ sub: 'uuid-1', sid: 'session-1' });
  });

  it.each([
    ['verifyAccessToken', { sub: 'uuid-1', email: 'a@b.com', typ: 'access' }],
    ['verifyRefreshToken', { sub: 'uuid-1', jti: 'jti-1', typ: 'refresh' }],
  ] as const)(
    '%s returns null for a token without a session id',
    async (method, decoded) => {
      const verifyAsync = jest.fn().mockResolvedValue(decoded);
      const jwtService = { verifyAsync } as unknown as JwtService;

      const service = new NestJwtTokenService(jwtService, buildConfig());

      await expect(service[method]('no-sid')).resolves.toBeNull();
    },
  );

  it('verifyAccessToken returns null (never throws) when verification fails', async () => {
    const verifyAsync = jest.fn().mockRejectedValue(new Error('jwt expired'));
    const jwtService = { verifyAsync } as unknown as JwtService;

    const service = new NestJwtTokenService(jwtService, buildConfig());

    await expect(service.verifyAccessToken('expired')).resolves.toBeNull();
  });

  it('verifyRefreshToken returns null when the decoded payload is missing required fields', async () => {
    const verifyAsync = jest
      .fn()
      .mockResolvedValue({ sub: 'uuid-1', sid: 'session-1', typ: 'refresh' });

    const jwtService = { verifyAsync } as unknown as JwtService;

    const service = new NestJwtTokenService(jwtService, buildConfig());

    await expect(service.verifyRefreshToken('bad-shape')).resolves.toBeNull();
  });

  it('verifyRefreshToken returns null (never throws) when verification fails', async () => {
    const verifyAsync = jest.fn().mockRejectedValue(new Error('bad token'));
    const jwtService = { verifyAsync } as unknown as JwtService;

    const service = new NestJwtTokenService(jwtService, buildConfig());

    await expect(service.verifyRefreshToken('garbage')).resolves.toBeNull();
  });

  it('accessTtlMs/refreshTtlMs report milliseconds (not seconds)', () => {
    const jwtService = {} as JwtService;
    const service = new NestJwtTokenService(jwtService, buildConfig());

    expect(service.accessTtlMs()).toBe(15 * 60 * 1000);
    expect(service.refreshTtlMs()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  describe('with a real JwtService', () => {
    const jwtService = new JwtService({});

    it('issues tokens whose header pins HS256 and whose claims carry the token kind', () => {
      const service = new NestJwtTokenService(jwtService, buildConfig());

      const access = jwtService.decode<Record<string, unknown>>(
        service.signAccessToken({
          sub: 'uuid-1',
          email: 'a@b.com',
          sid: 'session-1',
        }),
        { complete: true },
      );

      const refresh = jwtService.decode<Record<string, unknown>>(
        service.signRefreshToken({
          sub: 'uuid-1',
          jti: 'jti-1',
          sid: 'session-1',
        }),
        { complete: true },
      );

      expect(access).toMatchObject({
        header: { alg: 'HS256' },
        payload: { typ: 'access', aud: 'auth:access' },
      });
      expect(refresh).toMatchObject({
        header: { alg: 'HS256' },
        payload: { typ: 'refresh', aud: 'auth:refresh' },
      });
    });

    it('accepts a refresh token it issued', async () => {
      const service = new NestJwtTokenService(jwtService, buildConfig());

      const token = service.signRefreshToken({
        sub: 'uuid-1',
        jti: 'jti-1',
        sid: 'session-1',
      });

      await expect(service.verifyRefreshToken(token)).resolves.toMatchObject({
        sub: 'uuid-1',
        jti: 'jti-1',
        sid: 'session-1',
      });
    });

    it('accepts an access token it issued', async () => {
      const service = new NestJwtTokenService(jwtService, buildConfig());

      const token = service.signAccessToken({
        sub: 'uuid-1',
        email: 'a@b.com',
        sid: 'session-1',
      });

      await expect(service.verifyAccessToken(token)).resolves.toMatchObject({
        sub: 'uuid-1',
        sid: 'session-1',
      });
    });

    it('rejects a refresh token presented as an access token, even when both kinds share a secret', async () => {
      const service = new NestJwtTokenService(jwtService, SHARED_SECRET_CONFIG);

      const refreshToken = service.signRefreshToken({
        sub: 'uuid-1',
        jti: 'jti-1',
        sid: 'session-1',
      });

      await expect(service.verifyAccessToken(refreshToken)).resolves.toBeNull();
    });

    it('rejects an access token presented as a refresh token, even when both kinds share a secret', async () => {
      const service = new NestJwtTokenService(jwtService, SHARED_SECRET_CONFIG);

      const accessToken = service.signAccessToken({
        sub: 'uuid-1',
        email: 'a@b.com',
        sid: 'session-1',
      });

      await expect(service.verifyRefreshToken(accessToken)).resolves.toBeNull();
    });

    it('rejects a token with the refresh audience but a non-refresh typ claim', async () => {
      const token = jwtService.sign(
        { sub: 'uuid-1', jti: 'jti-1', sid: 'session-1', typ: 'access' },
        {
          secret: 'refresh-secret',
          algorithm: 'HS256',
          audience: 'auth:refresh',
        },
      );

      const service = new NestJwtTokenService(jwtService, buildConfig());

      await expect(service.verifyRefreshToken(token)).resolves.toBeNull();
    });

    it('rejects a token without the refresh audience, even when its typ claim says refresh', async () => {
      const token = jwtService.sign(
        { sub: 'uuid-1', jti: 'jti-1', sid: 'session-1', typ: 'refresh' },
        { secret: 'refresh-secret', algorithm: 'HS256' },
      );

      const service = new NestJwtTokenService(jwtService, buildConfig());

      await expect(service.verifyRefreshToken(token)).resolves.toBeNull();
    });

    it('rejects a refresh token signed with an algorithm other than HS256', async () => {
      const token = jwtService.sign(
        { sub: 'uuid-1', jti: 'jti-1', sid: 'session-1', typ: 'refresh' },
        {
          secret: 'refresh-secret',
          algorithm: 'HS512',
          audience: 'auth:refresh',
        },
      );

      const service = new NestJwtTokenService(jwtService, buildConfig());

      await expect(service.verifyRefreshToken(token)).resolves.toBeNull();
    });
  });
});
