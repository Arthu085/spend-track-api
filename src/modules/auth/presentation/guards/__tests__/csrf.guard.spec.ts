import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AppConfigService } from '@core/config';
import { ForbiddenError } from '@shared/domain/errors';
import { CSRF_HEADER_NAME } from '@shared/presentation/http';
import { CSRF_TOKEN_COOKIE } from '../../http/auth-cookie.constants';
import type { CsrfSessionResolver } from '../../http/csrf-session.resolver';
import { createCsrfToken } from '../../http/csrf-token';
import { CsrfGuard } from '../csrf.guard';
import { mockOf } from '@test/support/mocks/mock-of';

const COOKIE_SECRET = 'cookie-secret-used-only-in-this-spec';
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_SESSION_ID = '22222222-2222-4222-8222-222222222222';

function buildContext(request: Partial<Request>): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request as Request,
    }),
  } as unknown as ExecutionContext;
}

function buildRequest(
  method: string,
  cookieToken?: string,
  headerToken?: string,
): Partial<Request> {
  return {
    method,
    cookies:
      cookieToken !== undefined ? { [CSRF_TOKEN_COOKIE]: cookieToken } : {},
    headers:
      headerToken !== undefined ? { [CSRF_HEADER_NAME]: headerToken } : {},
  };
}

function flipLastCharacter(value: string): string {
  const last = value.slice(-1);

  return `${value.slice(0, -1)}${last === '0' ? '1' : '0'}`;
}

function tokenFor(sessionId: string = SESSION_ID): string {
  return createCsrfToken(sessionId, COOKIE_SECRET);
}

describe('CsrfGuard', () => {
  const config = {
    cookie: { secret: COOKIE_SECRET },
  } as unknown as AppConfigService;

  let resolve: jest.Mock;
  let guard: CsrfGuard;

  beforeEach(() => {
    resolve = jest.fn().mockResolvedValue(SESSION_ID);
    guard = new CsrfGuard(config, mockOf<CsrfSessionResolver>({ resolve }));
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'passes safe method %s through unconditionally, even without any token',
    async (method) => {
      const context = buildContext(buildRequest(method));

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(resolve).not.toHaveBeenCalled();
    },
  );

  it('passes when the header echoes a cookie token bound to the request session', async () => {
    const token = tokenFor();
    const request = buildRequest('POST', token, token);

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(resolve).toHaveBeenCalledWith(request);
  });

  // Token transplantation: copying another session's cookie and header values
  // must not work, even though the token is validly signed.
  it('throws ForbiddenError when matching tokens are bound to another session', async () => {
    const foreign = tokenFor(OTHER_SESSION_ID);
    const context = buildContext(buildRequest('POST', foreign, foreign));

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when the request has no session to bind to', async () => {
    resolve.mockResolvedValue(null);

    const token = tokenFor();
    const context = buildContext(buildRequest('POST', token, token));

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when the csrf cookie is missing', async () => {
    const context = buildContext(buildRequest('POST', undefined, tokenFor()));

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when the csrf header is missing', async () => {
    const context = buildContext(buildRequest('POST', tokenFor()));

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError without resolving the session when the header does not match the cookie', async () => {
    const context = buildContext(buildRequest('POST', tokenFor(), tokenFor()));

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenError);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('throws ForbiddenError when the cookie and header differ in length', async () => {
    const token = tokenFor();
    const context = buildContext(buildRequest('POST', token, `${token}0`));

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenError);
  });

  // Cookie tossing: a sibling subdomain can plant any csrf_token cookie and send the
  // same value in the header, so matching values alone must not be enough.
  it('throws ForbiddenError when matching cookie and header carry a tampered signature', async () => {
    const tampered = flipLastCharacter(tokenFor());
    const context = buildContext(buildRequest('POST', tampered, tampered));

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when matching cookie and header carry a tampered nonce', async () => {
    const [nonce, signature] = tokenFor().split('.');
    const tampered = `${flipLastCharacter(nonce)}.${signature}`;
    const context = buildContext(buildRequest('POST', tampered, tampered));

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when matching tokens were signed with a different secret', async () => {
    const foreign = createCsrfToken(SESSION_ID, 'some-other-secret');
    const context = buildContext(buildRequest('POST', foreign, foreign));

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when matching tokens are unsigned', async () => {
    const context = buildContext(
      buildRequest('POST', 'attacker-chosen-token', 'attacker-chosen-token'),
    );

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenError);
  });

  it('bypasses non-http contexts', async () => {
    const context = {
      getType: () => 'rpc',
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
