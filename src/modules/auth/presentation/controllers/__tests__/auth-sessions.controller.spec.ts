import 'reflect-metadata';
import type { Translate } from '@shared/presentation/decorators';
import type { Request, Response } from 'express';
import type { AppConfigService } from '@core/config';
import {
  AUDIT_METADATA_KEY,
  PUBLIC_METADATA_KEY,
  SUCCESS_MESSAGE_METADATA_KEY,
  readAuditActorId,
  type AuditCapableRequest,
} from '@shared/presentation/metadata';
import { PUBLIC_AUTH_FLOW_THROTTLE_METADATA_KEY } from '@shared/presentation/throttling';
import type { AuthenticatedUser } from '@shared/presentation/http';
import type { LoginUseCase } from '../../../application/use-cases/login.use-case';
import type { LogoutUseCase } from '../../../application/use-cases/logout.use-case';
import type { RefreshTokensUseCase } from '../../../application/use-cases/refresh-tokens.use-case';
import type { TokenService } from '../../../application/ports/token-service.port';
import {
  CSRF_SESSION_COOKIE,
  CSRF_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '../../http/auth-cookie.constants';
import type { CsrfSessionResolver } from '../../http/csrf-session.resolver';
import { createCsrfToken, isCsrfTokenBoundTo } from '../../http/csrf-token';
import { AuthSessionsController } from '../auth-sessions.controller';
import { buildUser } from '@test/support/builders/user.builder';
import { mockOf } from '@test/support/mocks/mock-of';

const translate: Translate = (key) => key;

const COOKIE_SECRET = 'cookie-secret';
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const PRE_SESSION_ID = '22222222-2222-4222-8222-222222222222';

const controllerHandlers =
  AuthSessionsController.prototype as unknown as Record<string, object>;

function buildConfig(): AppConfigService {
  return mockOf<AppConfigService>({
    cookie: {
      secret: COOKIE_SECRET,
      domain: '',
      secure: true,
      sameSite: 'lax',
    },
  });
}

function buildTokenService(): TokenService {
  return {
    signAccessToken: jest.fn(),
    signRefreshToken: jest.fn(),
    verifyAccessToken: jest.fn(),
    verifyRefreshToken: jest.fn(),
    accessTtlMs: jest.fn().mockReturnValue(900_000),
    refreshTtlMs: jest.fn().mockReturnValue(604_800_000),
  };
}

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
  const res = mockOf<Response>({ cookie, clearCookie, setHeader });

  return { res, cookie, clearCookie, setHeader };
}

function cookieValue(cookie: jest.Mock, name: string): string | undefined {
  return (cookie.mock.calls as Array<[string, string]>).find(
    ([cookieName]) => cookieName === name,
  )?.[1];
}

function buildController(
  overrides: Partial<{
    loginUseCase: Partial<LoginUseCase>;
    refreshTokensUseCase: Partial<RefreshTokensUseCase>;
    logoutUseCase: Partial<LogoutUseCase>;
    resolvedSessionId: string | null;
  }> = {},
): AuthSessionsController {
  const resolve = jest
    .fn()
    .mockResolvedValue(overrides.resolvedSessionId ?? null);

  return new AuthSessionsController(
    (overrides.loginUseCase ?? {}) as LoginUseCase,
    (overrides.refreshTokensUseCase ?? {}) as RefreshTokensUseCase,
    (overrides.logoutUseCase ?? {}) as LogoutUseCase,
    buildTokenService(),
    mockOf<CsrfSessionResolver>({ resolve }),
    buildConfig(),
  );
}

describe('AuthSessionsController', () => {
  describe('login', () => {
    it('delegates credentials to the use-case, issues session cookies, and returns the mapped user', async () => {
      const execute = jest.fn().mockResolvedValue({
        user: buildUser(),
        sessionId: SESSION_ID,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      const { res, cookie } = buildResponse();

      const req = mockOf<AuditCapableRequest>({ cookies: {} });

      const controller = buildController({ loginUseCase: { execute } });

      const result = await controller.login(
        { email: 'jane@example.com', password: 'plain-password' },
        req,
        res,
        translate,
      );

      expect(execute).toHaveBeenCalledWith({
        email: 'jane@example.com',
        password: 'plain-password',
      });
      expect(cookie).toHaveBeenCalled();
      expect(result.uuid).toBe('user-uuid');
      expect(result).not.toHaveProperty('accessToken');
      expect(result).not.toHaveProperty('refreshToken');
    });

    it('replaces the pre-session csrf token with one bound to the new session', async () => {
      const preSessionToken = createCsrfToken(PRE_SESSION_ID, COOKIE_SECRET);

      const execute = jest.fn().mockResolvedValue({
        user: buildUser(),
        sessionId: SESSION_ID,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      const { res, cookie, setHeader } = buildResponse();

      const controller = buildController({ loginUseCase: { execute } });

      await controller.login(
        { email: 'jane@example.com', password: 'plain-password' },
        mockOf<AuditCapableRequest>({
          cookies: { [CSRF_TOKEN_COOKIE]: preSessionToken },
        }),
        res,
        translate,
      );

      const csrfToken = cookieValue(cookie, CSRF_TOKEN_COOKIE)!;

      expect(csrfToken).not.toBe(preSessionToken);
      expect(isCsrfTokenBoundTo(csrfToken, SESSION_ID, COOKIE_SECRET)).toBe(
        true,
      );
      expect(cookieValue(cookie, CSRF_SESSION_COOKIE)).toBe(SESSION_ID);
      expect(setHeader).toHaveBeenCalledWith('x-csrf-token', csrfToken);
    });

    it('attaches the authenticated user as the audit actor', async () => {
      const execute = jest.fn().mockResolvedValue({
        user: buildUser(),
        sessionId: SESSION_ID,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      const req = mockOf<AuditCapableRequest>({ cookies: {} });

      const controller = buildController({ loginUseCase: { execute } });

      await controller.login(
        { email: 'jane@example.com', password: 'plain-password' },
        req,
        buildResponse().res,
        translate,
      );

      expect(readAuditActorId(req)).toBe('user-uuid');
    });

    it('attaches no audit actor and issues no cookies when the use-case rejects', async () => {
      const error = new Error('invalid credentials');
      const execute = jest.fn().mockRejectedValue(error);

      const { res, cookie } = buildResponse();

      const req = mockOf<AuditCapableRequest>({ cookies: {} });

      const controller = buildController({ loginUseCase: { execute } });

      await expect(
        controller.login(
          { email: 'jane@example.com', password: 'wrong-password' },
          req,
          res,
          translate,
        ),
      ).rejects.toBe(error);

      expect(readAuditActorId(req)).toBeUndefined();
      expect(cookie).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('reads the refresh token from the signed cookie and delegates to the use-case', async () => {
      const execute = jest.fn().mockResolvedValue({
        user: buildUser(),
        sessionId: SESSION_ID,
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const { res, cookie } = buildResponse();

      const req = mockOf<Parameters<AuthSessionsController['refresh']>[0]>({
        cookies: {},
        signedCookies: { [REFRESH_TOKEN_COOKIE]: 'old-refresh-token' },
      });

      const controller = buildController({
        refreshTokensUseCase: { execute },
      });

      const result = await controller.refresh(req, res, translate);

      expect(execute).toHaveBeenCalledWith({
        refreshToken: 'old-refresh-token',
      });
      expect(cookie).toHaveBeenCalled();
      expect(result.uuid).toBe('user-uuid');
    });

    it('keeps the csrf token the request carries when it is bound to the refreshed session', async () => {
      const current = createCsrfToken(SESSION_ID, COOKIE_SECRET);

      const execute = jest.fn().mockResolvedValue({
        user: buildUser(),
        sessionId: SESSION_ID,
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const { res, cookie } = buildResponse();

      const req = mockOf<Parameters<AuthSessionsController['refresh']>[0]>({
        cookies: { [CSRF_TOKEN_COOKIE]: current },
        signedCookies: { [REFRESH_TOKEN_COOKIE]: 'old-refresh-token' },
      });

      const controller = buildController({
        refreshTokensUseCase: { execute },
      });

      await controller.refresh(req, res, translate);

      expect(cookieValue(cookie, CSRF_TOKEN_COOKIE)).toBe(current);
      expect(cookieValue(cookie, CSRF_SESSION_COOKIE)).toBe(SESSION_ID);
    });

    it('passes undefined when the refresh cookie is absent', async () => {
      const execute = jest.fn().mockResolvedValue({
        user: buildUser(),
        sessionId: SESSION_ID,
        accessToken: 'a',
        refreshToken: 'r',
      });

      const req = mockOf<Parameters<AuthSessionsController['refresh']>[0]>({
        cookies: {},
        signedCookies: {},
      });

      const controller = buildController({
        refreshTokensUseCase: { execute },
      });

      await controller.refresh(req, buildResponse().res, translate);

      expect(execute).toHaveBeenCalledWith({ refreshToken: undefined });
    });
  });

  describe('csrf', () => {
    it('starts an anonymous pre-session when the request has none, and returns a token bound to it', async () => {
      const { res, cookie, setHeader } = buildResponse();

      const controller = buildController();

      const result = await controller.csrf(
        mockOf<Request>({ cookies: {} }),
        res,
      );

      const preSessionId = cookieValue(cookie, CSRF_SESSION_COOKIE)!;

      expect(preSessionId).toMatch(/^[0-9a-f-]{36}$/);
      expect(cookieValue(cookie, CSRF_TOKEN_COOKIE)).toBe(result.csrfToken);
      expect(setHeader).toHaveBeenCalledWith('x-csrf-token', result.csrfToken);
      expect(
        isCsrfTokenBoundTo(result.csrfToken, preSessionId, COOKIE_SECRET),
      ).toBe(true);
    });

    it('binds the token to the session the request already resolves to', async () => {
      const { res, cookie } = buildResponse();

      const controller = buildController({ resolvedSessionId: SESSION_ID });

      const result = await controller.csrf(
        mockOf<Request>({ cookies: {} }),
        res,
      );

      expect(cookieValue(cookie, CSRF_SESSION_COOKIE)).toBe(SESSION_ID);
      expect(
        isCsrfTokenBoundTo(result.csrfToken, SESSION_ID, COOKIE_SECRET),
      ).toBe(true);
    });

    it('returns the token already held in the cookie when it is bound to the session', async () => {
      const current = createCsrfToken(SESSION_ID, COOKIE_SECRET);

      const controller = buildController({ resolvedSessionId: SESSION_ID });

      const result = await controller.csrf(
        mockOf<Request>({ cookies: { [CSRF_TOKEN_COOKIE]: current } }),
        buildResponse().res,
      );

      expect(result.csrfToken).toBe(current);
    });

    it.each([
      ['a csrf_token cookie the server did not sign', 'attacker-chosen'],
      [
        'a token bound to another session',
        createCsrfToken(PRE_SESSION_ID, COOKIE_SECRET),
      ],
    ])('replaces %s', async (_label, current) => {
      const controller = buildController({ resolvedSessionId: SESSION_ID });

      const result = await controller.csrf(
        mockOf<Request>({ cookies: { [CSRF_TOKEN_COOKIE]: current } }),
        buildResponse().res,
      );

      expect(result.csrfToken).not.toBe(current);
      expect(
        isCsrfTokenBoundTo(result.csrfToken, SESSION_ID, COOKIE_SECRET),
      ).toBe(true);
    });
  });

  describe('logout', () => {
    it('revokes the current actor’s sessions and clears the auth cookies', async () => {
      const execute = jest.fn().mockResolvedValue(undefined);
      const { res, clearCookie } = buildResponse();

      const actor: AuthenticatedUser = {
        id: 1,
        uuid: 'user-uuid',
        email: 'jane@example.com',
        name: 'Jane Doe',
        roles: [],
      };

      const controller = buildController({ logoutUseCase: { execute } });

      const result = await controller.logout(actor, res);

      expect(execute).toHaveBeenCalledWith({ userUuid: 'user-uuid' });
      expect(clearCookie).toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('endpoint() route metadata', () => {
    it('login is public, audited, and carries a success message', () => {
      const handler = controllerHandlers.login;

      expect(Reflect.getMetadata(PUBLIC_METADATA_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, handler)).toBe(
        'Auth.login',
      );
      expect(Reflect.getMetadata(SUCCESS_MESSAGE_METADATA_KEY, handler)).toBe(
        'auth.success.logged_in',
      );
    });

    it('refresh is public, audited, and carries a success message', () => {
      const handler = controllerHandlers.refresh;

      expect(Reflect.getMetadata(PUBLIC_METADATA_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, handler)).toBe(
        'Auth.refresh',
      );
    });

    it('csrf is public', () => {
      const handler = controllerHandlers.csrf;

      expect(Reflect.getMetadata(PUBLIC_METADATA_KEY, handler)).toBe(true);
    });

    it.each(['login', 'refresh'])(
      '%s uses the auth flow throttle budget',
      (name) => {
        expect(
          Reflect.getMetadata(
            PUBLIC_AUTH_FLOW_THROTTLE_METADATA_KEY,
            controllerHandlers[name],
          ),
        ).toBe(true);
      },
    );

    it('csrf keeps the global throttle budget', () => {
      expect(
        Reflect.getMetadata(
          PUBLIC_AUTH_FLOW_THROTTLE_METADATA_KEY,
          controllerHandlers.csrf,
        ),
      ).toBeUndefined();
    });

    it('logout is not public (requires an authenticated actor)', () => {
      const handler = controllerHandlers.logout;

      expect(Reflect.getMetadata(PUBLIC_METADATA_KEY, handler)).toBeUndefined();
      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, handler)).toBe(
        'Auth.logout',
      );
    });

    it('logout keeps the global throttle budget', () => {
      expect(
        Reflect.getMetadata(
          PUBLIC_AUTH_FLOW_THROTTLE_METADATA_KEY,
          controllerHandlers.logout,
        ),
      ).toBeUndefined();
    });
  });
});
