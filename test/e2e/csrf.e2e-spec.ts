import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  ADMIN_CREDENTIALS,
  CSRF_COOKIE,
  CSRF_HEADER,
  USER_CREDENTIALS,
} from './helpers/auth-agent';
import { E2E_CORS_ORIGIN } from './helpers/cors-origin';
import { createTestApp } from './helpers/create-test-app';
import { createIsolatedUser } from './helpers/isolated-user';

const DISALLOWED_ORIGIN = 'http://disallowed.example.com';
const CSRF_SESSION_COOKIE = 'csrf_session';
const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';
const TOKEN_PATTERN = /^[0-9a-f]{64}\.[0-9a-f]{64}$/;

interface CsrfBody {
  data: { csrfToken: string };
  meta: { message?: string };
}

interface StoredCookie {
  value: string;
  path: string;
}

function setCookiesOf(response: request.Response): string[] {
  const raw: unknown = (response.headers as Record<string, unknown>)[
    'set-cookie'
  ];

  if (Array.isArray(raw)) {
    return raw as string[];
  }

  return typeof raw === 'string' ? [raw] : [];
}

function setCookieFor(
  response: request.Response,
  name: string,
): string | undefined {
  return setCookiesOf(response).find((entry) => entry.startsWith(`${name}=`));
}

function bodyToken(response: request.Response): string {
  return (response.body as CsrfBody).data.csrfToken;
}

function headerToken(response: request.Response): string | undefined {
  return response.headers[CSRF_HEADER];
}

function flipLastCharacter(value: string): string {
  const last = value.slice(-1);

  return `${value.slice(0, -1)}${last === '0' ? '1' : '0'}`;
}

/**
 * A minimal browser cookie jar: stores `Set-Cookie` values with their `Path`,
 * honors clearing, and only sends a cookie to paths inside its `Path`, so the
 * refresh cookie reaches `/api/auth/refresh` and nothing else. Unlike
 * supertest's agent, single cookies can be dropped (to model expiry) or
 * copied in from another browser (to model transplantation or tossing).
 */
class Browser {
  private readonly cookies = new Map<string, StoredCookie>();

  /** The CSRF token the SPA keeps in memory. */
  csrfToken?: string;

  constructor(private readonly server: App) {}

  get(path: string): request.Test {
    return this.send(request(this.server).get(path), path);
  }

  post(path: string): request.Test {
    return this.send(request(this.server).post(path), path);
  }

  async bootstrap(): Promise<string> {
    const response = await this.get('/api/auth/csrf').expect(200);

    this.csrfToken = bodyToken(response);

    return this.csrfToken;
  }

  async login(credentials = ADMIN_CREDENTIALS): Promise<request.Response> {
    await this.bootstrap();

    const response = await this.post('/api/auth/login')
      .set(CSRF_HEADER, this.csrfToken!)
      .send(credentials)
      .expect(200);

    this.csrfToken = headerToken(response);

    return response;
  }

  cookie(name: string): StoredCookie | undefined {
    return this.cookies.get(name);
  }

  setCookie(name: string, cookie: StoredCookie): void {
    this.cookies.set(name, { ...cookie });
  }

  dropCookie(name: string): void {
    this.cookies.delete(name);
  }

  private send(test: request.Test, path: string): request.Test {
    const header = [...this.cookies]
      .filter(([, cookie]) => path.startsWith(cookie.path))
      .map(([name, cookie]) => `${name}=${cookie.value}`)
      .join('; ');

    if (header !== '') {
      test.set('Cookie', header);
    }

    return test.on('response', (response: request.Response) =>
      this.store(response),
    );
  }

  private store(response: request.Response): void {
    for (const entry of setCookiesOf(response)) {
      const [pair, ...attributes] = entry.split(';').map((part) => part.trim());
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);

      const path =
        attributes
          .find((attribute) => attribute.toLowerCase().startsWith('path='))
          ?.slice('path='.length) ?? '/';

      const cleared = attributes.some((attribute) =>
        attribute.toLowerCase().startsWith('expires=thu, 01 jan 1970'),
      );

      if (cleared || value === '') {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, { value, path });
      }
    }
  }
}

// These specs model a browser SPA on `E2E_CORS_ORIGIN`: it keeps only the
// token from the `GET /auth/csrf` body or the `X-CSRF-Token` response header
// (it cannot read the API's cookies), while the cookie jar replays cookies
// with the `Path` scoping a browser enforces.
describe('CSRF bootstrap for frontends (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  function browser(): Browser {
    return new Browser(app.getHttpServer());
  }

  describe('GET /auth/csrf', () => {
    it('returns the csrf_token cookie value in data.csrfToken and X-CSRF-Token, uncached', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/csrf')
        .expect(200);

      const cookie = setCookieFor(response, CSRF_COOKIE);
      const token = bodyToken(response);

      expect(token).toMatch(TOKEN_PATTERN);
      expect(cookie).toBeDefined();
      expect(cookie!.split(';')[0]).toBe(`${CSRF_COOKIE}=${token}`);
      expect(headerToken(response)).toBe(token);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('keeps the readable cookie attributes the double-submit check relies on', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/csrf')
        .expect(200);

      const attributes = setCookieFor(response, CSRF_COOKIE)!.toLowerCase();

      expect(attributes).toContain('path=/api');
      expect(attributes).toContain('samesite=lax');
      expect(attributes).not.toContain('httponly');
    });

    it('starts an anonymous pre-session in a signed, httpOnly csrf_session cookie', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/csrf')
        .expect(200);

      const attributes = setCookieFor(
        response,
        CSRF_SESSION_COOKIE,
      )!.toLowerCase();

      expect(attributes).toMatch(/^csrf_session=s%3a/);
      expect(attributes).toContain('path=/api');
      expect(attributes).toContain('httponly');
      expect(attributes).toContain('max-age=');
    });

    it('returns the same token on repeat calls, so several tabs share one token', async () => {
      const tab = browser();

      const first = await tab.bootstrap();
      const second = await tab.bootstrap();

      expect(second).toBe(first);
    });

    it('replaces a csrf_token cookie the server did not sign', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/csrf')
        .set('Cookie', `${CSRF_COOKIE}=attacker-chosen-token`)
        .expect(200);

      expect(bodyToken(response)).not.toBe('attacker-chosen-token');
      expect(setCookieFor(response, CSRF_COOKIE)).toContain(
        bodyToken(response),
      );
    });
  });

  describe('credentialed cross-origin flow', () => {
    it('logs in, calls protected routes, refreshes, and logs out, following the token the API returns', async () => {
      const credentials = await createIsolatedUser(app);
      const spa = browser();

      const csrfResponse = await spa
        .get('/api/auth/csrf')
        .set('Origin', E2E_CORS_ORIGIN)
        .expect(200);

      expect(csrfResponse.headers['access-control-allow-origin']).toBe(
        E2E_CORS_ORIGIN,
      );
      expect(csrfResponse.headers['access-control-allow-credentials']).toBe(
        'true',
      );
      expect(
        csrfResponse.headers['access-control-expose-headers']
          .toLowerCase()
          .split(','),
      ).toContain(CSRF_HEADER);

      const preSessionToken = bodyToken(csrfResponse);

      const loginResponse = await spa
        .post('/api/auth/login')
        .set('Origin', E2E_CORS_ORIGIN)
        .set(CSRF_HEADER, preSessionToken)
        .send(credentials)
        .expect(200);

      // Login starts a new session, so the token is replaced and returned in
      // the response header the SPA can read cross-origin.
      const sessionToken = headerToken(loginResponse)!;

      expect(sessionToken).toMatch(TOKEN_PATTERN);
      expect(sessionToken).not.toBe(preSessionToken);
      expect(setCookieFor(loginResponse, CSRF_COOKIE)?.split(';')[0]).toBe(
        `${CSRF_COOKIE}=${sessionToken}`,
      );

      await spa.get('/api/users/me').set('Origin', E2E_CORS_ORIGIN).expect(200);

      const refreshResponse = await spa
        .post('/api/auth/refresh')
        .set('Origin', E2E_CORS_ORIGIN)
        .set(CSRF_HEADER, sessionToken)
        .expect(200);

      // Refresh keeps the session, so the token the SPA holds stays valid.
      expect(headerToken(refreshResponse)).toBe(sessionToken);

      await spa
        .post('/api/auth/logout')
        .set('Origin', E2E_CORS_ORIGIN)
        .set(CSRF_HEADER, sessionToken)
        .expect(200);

      expect(spa.cookie(CSRF_COOKIE)).toBeUndefined();
      expect(spa.cookie(CSRF_SESSION_COOKIE)).toBeUndefined();

      // Logout clears both CSRF cookies; the SPA must bootstrap again.
      await spa
        .post('/api/auth/login')
        .set(CSRF_HEADER, sessionToken)
        .send(credentials)
        .expect(403);

      const freshToken = await spa.bootstrap();

      await spa
        .post('/api/auth/login')
        .set(CSRF_HEADER, freshToken)
        .send(credentials)
        .expect(200);
    });

    it('answers the preflight for a credentialed request carrying X-CSRF-Token', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/users/me')
        .set('Origin', E2E_CORS_ORIGIN)
        .set('Access-Control-Request-Method', 'PATCH')
        .set('Access-Control-Request-Headers', `content-type,${CSRF_HEADER}`)
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe(
        E2E_CORS_ORIGIN,
      );
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-allow-methods']).toContain(
        'PATCH',
      );
      expect(response.headers['access-control-allow-headers']).toContain(
        CSRF_HEADER,
      );
    });
  });

  describe('session binding', () => {
    it('rejects the pre-session token once login has started a new session', async () => {
      const spa = browser();
      const preSessionToken = await spa.bootstrap();

      await spa
        .post('/api/auth/login')
        .set(CSRF_HEADER, preSessionToken)
        .send(ADMIN_CREDENTIALS)
        .expect(200);

      await spa
        .post('/api/auth/logout')
        .set(CSRF_HEADER, preSessionToken)
        .expect(403);
    });

    it('starts a new session on every login, even when already signed in', async () => {
      const spa = browser();

      await spa.login();
      const firstSessionToken = spa.csrfToken!;

      const renewal = await spa
        .post('/api/auth/login')
        .set(CSRF_HEADER, firstSessionToken)
        .send(ADMIN_CREDENTIALS)
        .expect(200);

      const secondSessionToken = headerToken(renewal)!;

      expect(secondSessionToken).not.toBe(firstSessionToken);

      // Refresh, not logout, proves the new token works: logout revokes every
      // refresh token of the shared seed admin, which parallel suites rely on.
      await spa
        .post('/api/auth/refresh')
        .set(CSRF_HEADER, firstSessionToken)
        .expect(403);
      await spa
        .post('/api/auth/refresh')
        .set(CSRF_HEADER, secondSessionToken)
        .expect(200);
    });

    // Token transplantation: the attacker copies a validly signed token (and
    // its cookie) from their own session into the victim's browser.
    it('rejects a csrf_token cookie and header copied from another signed-in session', async () => {
      const attacker = browser();
      const victim = browser();

      await attacker.login(USER_CREDENTIALS);
      await victim.login(ADMIN_CREDENTIALS);

      victim.setCookie(CSRF_COOKIE, attacker.cookie(CSRF_COOKIE)!);

      await victim
        .post('/api/auth/logout')
        .set(CSRF_HEADER, attacker.csrfToken!)
        .expect(403);
    });

    // Cookie tossing: a sibling subdomain overwrites every CSRF cookie with a
    // matching set from the attacker's own session. The victim's access token
    // still names the victim's session, so the planted pair does not verify.
    it('rejects transplanted csrf_token and csrf_session cookies while the victim has a valid access token', async () => {
      const attacker = browser();
      const victim = browser();

      await attacker.login(USER_CREDENTIALS);
      await victim.login(ADMIN_CREDENTIALS);

      victim.setCookie(CSRF_COOKIE, attacker.cookie(CSRF_COOKIE)!);
      victim.setCookie(
        CSRF_SESSION_COOKIE,
        attacker.cookie(CSRF_SESSION_COOKIE)!,
      );

      await victim
        .post('/api/auth/logout')
        .set(CSRF_HEADER, attacker.csrfToken!)
        .expect(403);
      await victim
        .post('/api/auth/refresh')
        .set(CSRF_HEADER, attacker.csrfToken!)
        .expect(403);
    });

    it('rejects a token from another session of the same user', async () => {
      const firstDevice = browser();
      const secondDevice = browser();

      await firstDevice.login(ADMIN_CREDENTIALS);
      await secondDevice.login(ADMIN_CREDENTIALS);

      secondDevice.setCookie(CSRF_COOKIE, firstDevice.cookie(CSRF_COOKIE)!);

      await secondDevice
        .post('/api/auth/logout')
        .set(CSRF_HEADER, firstDevice.csrfToken!)
        .expect(403);
    });

    it('rejects an anonymous token and cookie copied into another anonymous browser', async () => {
      const attacker = browser();
      const victim = browser();

      await attacker.bootstrap();
      await victim.bootstrap();

      victim.setCookie(CSRF_COOKIE, attacker.cookie(CSRF_COOKIE)!);

      await victim
        .post('/api/auth/login')
        .set(CSRF_HEADER, attacker.csrfToken!)
        .send(ADMIN_CREDENTIALS)
        .expect(403);
    });

    it('rejects a matching csrf_token cookie and header with no session to bind to', async () => {
      const donor = browser();

      await donor.bootstrap();

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Cookie', `${CSRF_COOKIE}=${donor.csrfToken}`)
        .set(CSRF_HEADER, donor.csrfToken!)
        .send(ADMIN_CREDENTIALS)
        .expect(403);
    });

    it('rejects a tampered session token even when cookie and header match', async () => {
      const spa = browser();

      await spa.login();

      const tampered = flipLastCharacter(spa.csrfToken!);

      spa.setCookie(CSRF_COOKIE, {
        ...spa.cookie(CSRF_COOKIE)!,
        value: tampered,
      });

      await spa.post('/api/auth/logout').set(CSRF_HEADER, tampered).expect(403);
    });
  });

  describe('expired access tokens', () => {
    it('refreshes with the session token after the access cookie has expired', async () => {
      const spa = browser();

      await spa.login();
      spa.dropCookie(ACCESS_COOKIE);

      const response = await spa
        .post('/api/auth/refresh')
        .set(CSRF_HEADER, spa.csrfToken!)
        .expect(200);

      expect(headerToken(response)).toBe(spa.csrfToken);
      expect(spa.cookie(ACCESS_COOKIE)).toBeDefined();
    });

    it('refreshes after a browser restart that dropped the access and csrf_token cookies', async () => {
      const spa = browser();

      await spa.login();
      const sessionToken = spa.csrfToken;

      spa.dropCookie(ACCESS_COOKIE);
      spa.dropCookie(CSRF_COOKIE);

      // The persistent csrf_session cookie still names the signed-in session,
      // so the bootstrap returns a token the refresh cookie accepts.
      const bootstrapped = await spa.bootstrap();

      expect(bootstrapped).not.toBe(sessionToken);

      await spa
        .post('/api/auth/refresh')
        .set(CSRF_HEADER, bootstrapped)
        .expect(200);
    });

    it('binds refresh to the refresh token, not to a csrf_session cookie naming another session', async () => {
      const spa = browser();
      const other = browser();

      await spa.login();
      await other.bootstrap();

      spa.dropCookie(ACCESS_COOKIE);
      spa.setCookie(CSRF_COOKIE, other.cookie(CSRF_COOKIE)!);
      spa.setCookie(CSRF_SESSION_COOKIE, other.cookie(CSRF_SESSION_COOKIE)!);

      await spa
        .post('/api/auth/refresh')
        .set(CSRF_HEADER, other.csrfToken!)
        .expect(403);
    });

    it('answers 401, not a CSRF 403, on a protected route once the access cookie has expired', async () => {
      const spa = browser();

      await spa.login();
      spa.dropCookie(ACCESS_COOKIE);

      await spa
        .post('/api/auth/logout')
        .set(CSRF_HEADER, spa.csrfToken!)
        .expect(401);
    });

    it('never sends the refresh cookie outside its path, so only refresh can bind to it', async () => {
      const spa = browser();

      await spa.login();

      expect(spa.cookie(REFRESH_COOKIE)?.path).toBe('/api/auth/refresh');
    });
  });

  describe('invalid requests', () => {
    it.each([
      ['login', '/api/auth/login', ADMIN_CREDENTIALS],
      ['refresh', '/api/auth/refresh', {}],
      ['forgot-password', '/api/auth/forgot-password', { email: 'a@b.co' }],
      [
        'reset-password',
        '/api/auth/reset-password',
        { token: 'uuid.secret', password: 'StrongPass123!' },
      ],
    ])(
      'rejects %s without the header, or with a header that does not match the cookie',
      async (_label, path, body) => {
        const spa = browser();
        const token = await spa.bootstrap();
        const otherToken = await browser().bootstrap();

        await spa.post(path).send(body).expect(403);
        await spa
          .post(path)
          .set(CSRF_HEADER, otherToken)
          .send(body)
          .expect(403);
        await spa
          .post(path)
          .set(CSRF_HEADER, token.toUpperCase())
          .send(body)
          .expect(403);
      },
    );

    it('rejects a body token sent without its matching cookie', async () => {
      const token = await browser().bootstrap();

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set(CSRF_HEADER, token)
        .send(ADMIN_CREDENTIALS)
        .expect(403);
    });
  });

  describe('origins outside CORS_ORIGINS', () => {
    it('never lets the browser read the token: no CORS headers on GET /auth/csrf', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/csrf')
        .set('Origin', DISALLOWED_ORIGIN)
        .expect(200);

      // `cors` sends Allow-Credentials unconditionally; without a matching
      // Allow-Origin the browser still withholds the response from the page.
      expect(response.headers).not.toHaveProperty(
        'access-control-allow-origin',
      );
    });

    it('fails the preflight a cross-origin X-CSRF-Token request needs', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/auth/login')
        .set('Origin', DISALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', `content-type,${CSRF_HEADER}`);

      expect(response.headers).not.toHaveProperty(
        'access-control-allow-origin',
      );
    });

    it('rejects a simple cross-site POST that rides on the victim cookies', async () => {
      const spa = browser();

      await spa.bootstrap();

      await spa
        .post('/api/auth/login')
        .set('Origin', DISALLOWED_ORIGIN)
        .set('Content-Type', 'text/plain')
        .send(JSON.stringify(ADMIN_CREDENTIALS))
        .expect(403);
    });
  });
});
