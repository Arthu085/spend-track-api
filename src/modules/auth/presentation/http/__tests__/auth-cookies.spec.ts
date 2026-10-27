import type { CookieOptions, Response } from 'express';
import type { AppConfigService } from '@core/config';
import { CSRF_HEADER_NAME } from '@shared/presentation/http';
import {
  ACCESS_COOKIE_PATH,
  ACCESS_TOKEN_COOKIE,
  CSRF_SESSION_COOKIE,
  CSRF_TOKEN_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_COOKIE,
} from '../auth-cookie.constants';
import {
  clearAuthCookies,
  issueCsrfCookies,
  issueSessionCookies,
  setAuthCookies,
} from '../auth-cookies';
import { createCsrfToken, isCsrfTokenBoundTo } from '../csrf-token';

type CookieConfig = AppConfigService['cookie'];

function buildCookieConfig(overrides?: Partial<CookieConfig>): CookieConfig {
  return {
    secret: SECRET,
    domain: '',
    secure: true,
    sameSite: 'lax',
    ...overrides,
  };
}

const SECRET = 'cookie-secret';
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_SESSION_ID = '22222222-2222-4222-8222-222222222222';
const BINDING = { sessionId: SESSION_ID, ttlMs: 604_800_000 };

interface ResponseMock {
  res: Response;
  cookie: jest.Mock;
  clearCookie: jest.Mock;
  setHeader: jest.Mock;
}

function buildResponse(): ResponseMock {
  const cookie = jest.fn();
  const clearCookie = jest.fn();
  const setHeader = jest.fn();
  const res = { cookie, clearCookie, setHeader } as unknown as Response;

  return { res, cookie, clearCookie, setHeader };
}

function cookieCallsOf(
  cookie: jest.Mock,
): Array<[string, string, CookieOptions]> {
  return cookie.mock.calls as Array<[string, string, CookieOptions]>;
}

describe('setAuthCookies', () => {
  it('sets access_token as httpOnly, signed, scoped to the access path with the access TTL', () => {
    const { res, cookie } = buildResponse();

    setAuthCookies(
      res,
      {
        accessToken: 'access-token-value',
        refreshToken: 'refresh-token-value',
        accessTtlMs: 900_000,
        refreshTtlMs: 604_800_000,
      },
      buildCookieConfig(),
    );

    const [name, value, options] = cookie.mock.calls[0] as [
      string,
      string,
      CookieOptions,
    ];

    expect(name).toBe(ACCESS_TOKEN_COOKIE);
    expect(value).toBe('access-token-value');
    expect(options.httpOnly).toBe(true);
    expect(options.signed).toBe(true);
    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.path).toBe(ACCESS_COOKIE_PATH);
    expect(options.maxAge).toBe(900_000);
  });

  it('sets refresh_token as httpOnly, signed, scoped to the refresh path with the refresh TTL', () => {
    const { res, cookie } = buildResponse();

    setAuthCookies(
      res,
      {
        accessToken: 'access-token-value',
        refreshToken: 'refresh-token-value',
        accessTtlMs: 900_000,
        refreshTtlMs: 604_800_000,
      },
      buildCookieConfig(),
    );

    const [name, value, options] = cookie.mock.calls[1] as [
      string,
      string,
      CookieOptions,
    ];

    expect(name).toBe(REFRESH_TOKEN_COOKIE);
    expect(value).toBe('refresh-token-value');
    expect(options.httpOnly).toBe(true);
    expect(options.signed).toBe(true);
    expect(options.path).toBe(REFRESH_COOKIE_PATH);
    expect(options.maxAge).toBe(604_800_000);
  });

  it('omits the domain option when the configured domain is an empty string', () => {
    const { res, cookie } = buildResponse();

    setAuthCookies(
      res,
      {
        accessToken: 'a',
        refreshToken: 'r',
        accessTtlMs: 1,
        refreshTtlMs: 1,
      },
      buildCookieConfig({ domain: '' }),
    );

    for (const call of cookieCallsOf(cookie)) {
      expect(call[2].domain).toBeUndefined();
    }
  });

  it('sets the domain option when a non-empty domain is configured', () => {
    const { res, cookie } = buildResponse();

    setAuthCookies(
      res,
      {
        accessToken: 'a',
        refreshToken: 'r',
        accessTtlMs: 1,
        refreshTtlMs: 1,
      },
      buildCookieConfig({ domain: 'example.com' }),
    );

    for (const call of cookieCallsOf(cookie)) {
      expect(call[2].domain).toBe('example.com');
    }
  });
});

describe('clearAuthCookies', () => {
  it('clears the auth cookies and both csrf cookies with matching paths', () => {
    const { res, clearCookie } = buildResponse();

    clearAuthCookies(res, buildCookieConfig());

    expect(clearCookie).toHaveBeenCalledTimes(4);

    const calls = clearCookie.mock.calls as Array<[string, CookieOptions]>;
    const byName = new Map(calls.map(([name, options]) => [name, options]));

    expect(byName.get(ACCESS_TOKEN_COOKIE)?.path).toBe(ACCESS_COOKIE_PATH);
    expect(byName.get(REFRESH_TOKEN_COOKIE)?.path).toBe(REFRESH_COOKIE_PATH);
    expect(byName.get(CSRF_TOKEN_COOKIE)?.path).toBe(ACCESS_COOKIE_PATH);
    expect(byName.get(CSRF_SESSION_COOKIE)?.path).toBe(ACCESS_COOKIE_PATH);
  });
});

describe('issueCsrfCookies', () => {
  it('sets the session id in an httpOnly, signed csrf_session cookie with the binding TTL', () => {
    const { res, cookie } = buildResponse();

    issueCsrfCookies(res, buildCookieConfig(), BINDING);

    const sessionCall = cookieCallsOf(cookie).find(
      ([name]) => name === CSRF_SESSION_COOKIE,
    );

    expect(sessionCall?.[1]).toBe(SESSION_ID);
    expect(sessionCall?.[2]).toMatchObject({
      httpOnly: true,
      signed: true,
      secure: true,
      sameSite: 'lax',
      path: ACCESS_COOKIE_PATH,
      maxAge: BINDING.ttlMs,
    });
  });

  it('sets a non-httpOnly, non-signed csrf_token cookie and returns its value', () => {
    const { res, cookie } = buildResponse();

    const token = issueCsrfCookies(res, buildCookieConfig(), BINDING);

    const tokenCall = cookieCallsOf(cookie).find(
      ([name]) => name === CSRF_TOKEN_COOKIE,
    );

    expect(tokenCall?.[1]).toBe(token);
    expect(tokenCall?.[2]).toMatchObject({
      httpOnly: false,
      signed: false,
      path: ACCESS_COOKIE_PATH,
    });
  });

  it('returns the token in the X-CSRF-Token response header', () => {
    const { res, setHeader } = buildResponse();

    const token = issueCsrfCookies(res, buildCookieConfig(), BINDING);

    expect(setHeader).toHaveBeenCalledWith(CSRF_HEADER_NAME, token);
  });

  it('binds the token to the session id under the configured cookie secret', () => {
    const { res } = buildResponse();

    const token = issueCsrfCookies(res, buildCookieConfig(), BINDING);

    expect(isCsrfTokenBoundTo(token, SESSION_ID, SECRET)).toBe(true);
    expect(isCsrfTokenBoundTo(token, OTHER_SESSION_ID, SECRET)).toBe(false);
  });

  it('generates a different token on every call without a current token', () => {
    const { res } = buildResponse();

    const first = issueCsrfCookies(res, buildCookieConfig(), BINDING);
    const second = issueCsrfCookies(res, buildCookieConfig(), BINDING);

    expect(first).not.toBe(second);
  });

  it('keeps a current token bound to the same session, so clients holding it stay valid', () => {
    const { res } = buildResponse();
    const current = createCsrfToken(SESSION_ID, SECRET);

    const token = issueCsrfCookies(res, buildCookieConfig(), BINDING, current);

    expect(token).toBe(current);
  });

  it.each([
    ['an unsigned value', 'attacker-chosen-token'],
    [
      'a token signed under another secret',
      createCsrfToken(SESSION_ID, 'rotated-secret'),
    ],
    [
      'a token bound to another session',
      createCsrfToken(OTHER_SESSION_ID, SECRET),
    ],
    ['a non-string value', ['a', 'b']],
  ])('replaces %s with a token bound to the session', (_label, current) => {
    const { res } = buildResponse();

    const token = issueCsrfCookies(res, buildCookieConfig(), BINDING, current);

    expect(token).not.toEqual(current);
    expect(isCsrfTokenBoundTo(token, SESSION_ID, SECRET)).toBe(true);
  });
});

describe('issueSessionCookies', () => {
  const session = {
    accessToken: 'access-token-value',
    refreshToken: 'refresh-token-value',
    accessTtlMs: 900_000,
    refreshTtlMs: 604_800_000,
    sessionId: SESSION_ID,
  };

  it('sets both auth cookies and both csrf cookies in one call', () => {
    const { res, cookie } = buildResponse();

    issueSessionCookies(res, session, buildCookieConfig(), undefined);

    const names = cookieCallsOf(cookie).map(([name]) => name);

    expect(names).toEqual([
      ACCESS_TOKEN_COOKIE,
      REFRESH_TOKEN_COOKIE,
      CSRF_SESSION_COOKIE,
      CSRF_TOKEN_COOKIE,
    ]);
  });

  it('gives csrf_session the refresh TTL, so the binding outlives an expired access token', () => {
    const { res, cookie } = buildResponse();

    issueSessionCookies(res, session, buildCookieConfig(), undefined);

    const sessionCall = cookieCallsOf(cookie).find(
      ([name]) => name === CSRF_SESSION_COOKIE,
    );

    expect(sessionCall?.[1]).toBe(SESSION_ID);
    expect(sessionCall?.[2].maxAge).toBe(session.refreshTtlMs);
  });

  it("keeps the request's csrf token when it is bound to the same session (refresh)", () => {
    const { res, cookie } = buildResponse();
    const current = createCsrfToken(SESSION_ID, SECRET);

    issueSessionCookies(res, session, buildCookieConfig(), current);

    const csrfCall = cookieCallsOf(cookie).find(
      ([name]) => name === CSRF_TOKEN_COOKIE,
    );

    expect(csrfCall?.[1]).toBe(current);
  });

  it("replaces the request's csrf token when it is bound to another session (login)", () => {
    const { res, cookie } = buildResponse();
    const preSessionToken = createCsrfToken(OTHER_SESSION_ID, SECRET);

    issueSessionCookies(res, session, buildCookieConfig(), preSessionToken);

    const csrfCall = cookieCallsOf(cookie).find(
      ([name]) => name === CSRF_TOKEN_COOKIE,
    );

    expect(csrfCall?.[1]).not.toBe(preSessionToken);
    expect(isCsrfTokenBoundTo(csrfCall![1], SESSION_ID, SECRET)).toBe(true);
  });
});
