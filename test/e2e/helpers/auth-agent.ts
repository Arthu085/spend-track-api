import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

// Derived rather than referencing `request.Test` directly, to avoid relying on
// `supertest`'s `export =` + namespace merging resolving cleanly in a type
// position across every consumer's tsconfig.
type SupertestClient = ReturnType<typeof request>;
type SupertestResponse = Awaited<ReturnType<SupertestClient['get']>>;
export type SupertestTest = ReturnType<SupertestClient['get']>;

export const CSRF_HEADER = 'x-csrf-token';
export const CSRF_COOKIE = 'csrf_token';

export interface Credentials {
  email: string;
  password: string;
}

export const ADMIN_CREDENTIALS: Credentials = {
  email: 'e2e-admin@example.com',
  password: 'E2e-admin-password',
};

export const USER_CREDENTIALS: Credentials = {
  email: 'user@example.com',
  password: 'ChangeMe123!',
};

export interface AuthAgent {
  /** Raw `Cookie` header value carrying the authenticated session. */
  readonly cookieHeader: string;
  /** The CSRF token matching the `csrf_token` cookie in `cookieHeader`. */
  readonly csrfToken: string;
  get(path: string): SupertestTest;
  post(path: string): SupertestTest;
  put(path: string): SupertestTest;
  patch(path: string): SupertestTest;
  delete(path: string): SupertestTest;
}

function extractSetCookies(response: SupertestResponse): string[] {
  const raw: unknown = (response.headers as Record<string, unknown>)[
    'set-cookie'
  ];

  if (Array.isArray(raw)) {
    return raw as string[];
  }

  return typeof raw === 'string' ? [raw] : [];
}

/**
 * Builds a `Cookie` request header from every `Set-Cookie` entry on a
 * response, ignoring cookie attributes (Path, HttpOnly, ...). Bypassing a
 * client-side cookie jar (which would enforce `Path` scoping like a real
 * browser) is deliberate: `Path` scoping is a browser-side concern, not part
 * of this backend's contract.
 */
function buildCookieHeader(response: SupertestResponse): string {
  return extractSetCookies(response)
    .map((entry) => entry.split(';')[0])
    .join('; ');
}

function extractCookieValue(
  response: SupertestResponse,
  name: string,
): string | undefined {
  const entry = extractSetCookies(response).find((cookie) =>
    cookie.startsWith(`${name}=`),
  );

  return entry?.split(';')[0].slice(name.length + 1);
}

/**
 * Authenticates against `POST /api/auth/login` (fetching a CSRF token first,
 * since login is itself an unsafe/CSRF-protected method) and returns a thin wrapper
 * exposing the same `.get/.post/.put/.patch/.delete` shape as
 * `request(app.getHttpServer())`, with the session `Cookie` header and a
 * matching `X-CSRF-Token` header pre-attached to every request.
 */
export async function createAuthAgent(
  app: INestApplication<App>,
  credentials: Credentials = ADMIN_CREDENTIALS,
): Promise<AuthAgent> {
  const server = app.getHttpServer();

  const csrfResponse = await request(server).get('/api/auth/csrf').expect(200);
  const csrfCookieHeader = buildCookieHeader(csrfResponse);
  const initialCsrfToken = extractCookieValue(csrfResponse, CSRF_COOKIE);

  if (initialCsrfToken === undefined) {
    throw new Error('GET /auth/csrf did not issue a csrf_token cookie');
  }

  const loginResponse = await request(server)
    .post('/api/auth/login')
    .set('Cookie', csrfCookieHeader)
    .set(CSRF_HEADER, initialCsrfToken)
    .send(credentials)
    .expect(200);

  const cookieHeader = buildCookieHeader(loginResponse);

  const csrfToken =
    extractCookieValue(loginResponse, CSRF_COOKIE) ?? initialCsrfToken;

  const withCookie = (test: SupertestTest): SupertestTest =>
    test.set('Cookie', cookieHeader);

  const withCsrf = (test: SupertestTest): SupertestTest =>
    withCookie(test).set(CSRF_HEADER, csrfToken);

  return {
    cookieHeader,
    csrfToken,
    get: (path) => withCookie(request(server).get(path)),
    post: (path) => withCsrf(request(server).post(path)),
    put: (path) => withCsrf(request(server).put(path)),
    patch: (path) => withCsrf(request(server).patch(path)),
    delete: (path) => withCsrf(request(server).delete(path)),
  };
}
