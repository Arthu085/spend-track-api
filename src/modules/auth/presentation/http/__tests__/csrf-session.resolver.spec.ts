import type { Request } from 'express';
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
  TokenService,
} from '../../../application/ports/token-service.port';
import {
  ACCESS_TOKEN_COOKIE,
  CSRF_SESSION_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '../auth-cookie.constants';
import { CsrfSessionResolver } from '../csrf-session.resolver';
import { mockOf } from '@test/support/mocks/mock-of';

const ACCESS_PAYLOAD: AccessTokenPayload = {
  sub: 'user-uuid',
  email: 'a@b.co',
  sid: 'access-session',
};

const REFRESH_PAYLOAD: RefreshTokenPayload = {
  sub: 'user-uuid',
  jti: 'jti-1',
  sid: 'refresh-session',
};

interface ResolverDeps {
  resolver: CsrfSessionResolver;
  verifyAccessToken: jest.Mock;
  verifyRefreshToken: jest.Mock;
}

function buildResolver(
  access: AccessTokenPayload | null = ACCESS_PAYLOAD,
  refresh: RefreshTokenPayload | null = REFRESH_PAYLOAD,
): ResolverDeps {
  const verifyAccessToken = jest.fn().mockResolvedValue(access);
  const verifyRefreshToken = jest.fn().mockResolvedValue(refresh);

  const resolver = new CsrfSessionResolver(
    mockOf<TokenService>({ verifyAccessToken, verifyRefreshToken }),
  );

  return { resolver, verifyAccessToken, verifyRefreshToken };
}

function requestWith(signedCookies: Record<string, unknown>): Request {
  return { signedCookies } as unknown as Request;
}

describe('CsrfSessionResolver', () => {
  it('binds to the refresh token session when a verified refresh cookie is present', async () => {
    const { resolver, verifyRefreshToken } = buildResolver();

    const sessionId = await resolver.resolve(
      requestWith({
        [REFRESH_TOKEN_COOKIE]: 'refresh-jwt',
        [ACCESS_TOKEN_COOKIE]: 'access-jwt',
        [CSRF_SESSION_COOKIE]: 'cookie-session',
      }),
    );

    expect(sessionId).toBe('refresh-session');
    expect(verifyRefreshToken).toHaveBeenCalledWith('refresh-jwt');
  });

  it('binds to the access token session when no refresh cookie is present', async () => {
    const { resolver, verifyAccessToken } = buildResolver();

    const sessionId = await resolver.resolve(
      requestWith({
        [ACCESS_TOKEN_COOKIE]: 'access-jwt',
        [CSRF_SESSION_COOKIE]: 'cookie-session',
      }),
    );

    expect(sessionId).toBe('access-session');
    expect(verifyAccessToken).toHaveBeenCalledWith('access-jwt');
  });

  // A tossed csrf_session cookie must never override the session of a valid
  // credential the request carries.
  it('ignores the csrf_session cookie when a valid access token names another session', async () => {
    const { resolver } = buildResolver();

    const sessionId = await resolver.resolve(
      requestWith({
        [ACCESS_TOKEN_COOKIE]: 'access-jwt',
        [CSRF_SESSION_COOKIE]: 'attacker-session',
      }),
    );

    expect(sessionId).toBe('access-session');
  });

  it('falls back to the access token when the refresh token does not verify', async () => {
    const { resolver } = buildResolver(ACCESS_PAYLOAD, null);

    const sessionId = await resolver.resolve(
      requestWith({
        [REFRESH_TOKEN_COOKIE]: 'expired-refresh-jwt',
        [ACCESS_TOKEN_COOKIE]: 'access-jwt',
      }),
    );

    expect(sessionId).toBe('access-session');
  });

  it('falls back to the csrf_session cookie when no credential verifies', async () => {
    const { resolver } = buildResolver(null, null);

    const sessionId = await resolver.resolve(
      requestWith({
        [REFRESH_TOKEN_COOKIE]: 'bad-refresh-jwt',
        [ACCESS_TOKEN_COOKIE]: 'expired-access-jwt',
        [CSRF_SESSION_COOKIE]: 'cookie-session',
      }),
    );

    expect(sessionId).toBe('cookie-session');
  });

  it('uses the csrf_session cookie for an anonymous request without verifying any JWT', async () => {
    const { resolver, verifyAccessToken, verifyRefreshToken } = buildResolver();

    const sessionId = await resolver.resolve(
      requestWith({ [CSRF_SESSION_COOKIE]: 'pre-session' }),
    );

    expect(sessionId).toBe('pre-session');
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(verifyRefreshToken).not.toHaveBeenCalled();
  });

  // cookie-parser reports a signed cookie with a bad signature as `false`.
  it.each([
    ['no cookies at all', {}],
    [
      'a csrf_session cookie with a bad signature',
      { [CSRF_SESSION_COOKIE]: false },
    ],
    [
      'auth cookies with bad signatures',
      { [ACCESS_TOKEN_COOKIE]: false, [REFRESH_TOKEN_COOKIE]: false },
    ],
  ])('returns null for %s', async (_label, signedCookies) => {
    const { resolver } = buildResolver();

    await expect(resolver.resolve(requestWith(signedCookies))).resolves.toBe(
      null,
    );
  });
});
