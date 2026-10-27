import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  USER_NOTIFIER,
  type UserNotifier,
} from '@modules/users/application/ports/user-notifier.port';
import {
  AUDIT_LOG_PORT,
  AuditOutcome,
  type AuditLogPort,
  type AuditRecordInput,
} from '@shared/index';
import {
  ADMIN_CREDENTIALS,
  createAuthAgent,
  CSRF_COOKIE,
  CSRF_HEADER,
  USER_CREDENTIALS,
} from './helpers/auth-agent';
import { createTestApp } from './helpers/create-test-app';
import { deliverQueuedEmails } from './helpers/deliver-queued-emails';
import { createIsolatedUser } from './helpers/isolated-user';

// Exact strings from `src/i18n/{pt-BR,en}/auth.json`, asserted literally to
// prove real translation, not a stub.
const PT_BR = {
  invalidCredentials: 'E-mail ou senha inválidos',
  unauthenticated: 'Autenticação necessária',
  invalidRefreshToken: 'Sessão inválida ou expirada',
};

const EN = {
  invalidCredentials: 'Invalid email or password',
};

interface EnvelopeBody<T> {
  data: T;
  meta: Record<string, unknown>;
}

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  timestamp: string;
  path: string;
  requiredAbilities?: Array<{
    action: string;
    actionLabel: string;
    subject: string;
    subjectLabel: string;
  }>;
}

interface UserShape {
  uuid: string;
  name: string;
  email: string;
}

function extractSetCookies(response: request.Response): string[] {
  const raw: unknown = (response.headers as Record<string, unknown>)[
    'set-cookie'
  ];

  if (Array.isArray(raw)) {
    return raw as string[];
  }

  return typeof raw === 'string' ? [raw] : [];
}

function findCookie(
  response: request.Response,
  name: string,
): string | undefined {
  return extractSetCookies(response).find((entry) =>
    entry.startsWith(`${name}=`),
  );
}

function cookieHeaderFrom(response: request.Response): string {
  return extractSetCookies(response)
    .map((entry) => entry.split(';')[0])
    .join('; ');
}

function cookieValue(response: request.Response, name: string): string {
  const entry = findCookie(response, name);
  const value = entry?.split(';')[0].slice(name.length + 1);

  if (value === undefined) {
    throw new Error(`Expected a "${name}" cookie in the response`);
  }

  return value;
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  async function getCsrf(): Promise<{ cookieHeader: string; token: string }> {
    const response = await request(app.getHttpServer())
      .get('/api/auth/csrf')
      .expect(200);

    return {
      cookieHeader: cookieHeaderFrom(response),
      token: cookieValue(response, CSRF_COOKIE),
    };
  }

  it('sets access_token (path /api) and refresh_token (path /api/auth/refresh) as httpOnly cookies, with no token in the response body', async () => {
    const csrf = await getCsrf();

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', csrf.cookieHeader)
      .set(CSRF_HEADER, csrf.token)
      .send(ADMIN_CREDENTIALS)
      .expect(200);

    const accessCookie = findCookie(response, 'access_token');
    const refreshCookie = findCookie(response, 'refresh_token');

    expect(accessCookie).toBeDefined();
    expect(refreshCookie).toBeDefined();
    expect(accessCookie?.toLowerCase()).toContain('httponly');
    expect(refreshCookie?.toLowerCase()).toContain('httponly');
    expect(accessCookie).toContain('Path=/api;');
    expect(refreshCookie).toContain('Path=/api/auth/refresh;');

    const body = response.body as EnvelopeBody<
      UserShape & { accessToken?: string; refreshToken?: string }
    >;

    expect(body.data.email).toBe(ADMIN_CREDENTIALS.email);
    expect(body.data).not.toHaveProperty('accessToken');
    expect(body.data).not.toHaveProperty('refreshToken');
    expect(Object.keys(body.data)).not.toEqual(
      expect.arrayContaining(['password', 'accessToken', 'refreshToken']),
    );
  });

  it('rejects a wrong password with a localized 401, pt-BR by default and en via x-lang', async () => {
    const csrf = await getCsrf();

    const ptResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', csrf.cookieHeader)
      .set(CSRF_HEADER, csrf.token)
      .send({ email: ADMIN_CREDENTIALS.email, password: 'wrong-password' })
      .expect(401);

    const ptBody = ptResponse.body as ErrorBody;

    expect(ptBody.message).toBe(PT_BR.invalidCredentials);

    const enCsrf = await getCsrf();

    const enResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', enCsrf.cookieHeader)
      .set(CSRF_HEADER, enCsrf.token)
      .set('x-lang', 'en')
      .send({ email: ADMIN_CREDENTIALS.email, password: 'wrong-password' })
      .expect(401);

    const enBody = enResponse.body as ErrorBody;

    expect(enBody.message).toBe(EN.invalidCredentials);
  });

  it('rejects an oversized login password with a translated 400 before hashing it', async () => {
    const csrf = await getCsrf();

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', csrf.cookieHeader)
      .set(CSRF_HEADER, csrf.token)
      .set('x-lang', 'en')
      .send({ email: ADMIN_CREDENTIALS.email, password: 'p'.repeat(129) })
      .expect(400);

    const body = response.body as { message: string[] };

    expect(body.message).toEqual([
      'The password field must be at most 128 characters long',
    ]);
  });

  it('reports a missing login password as required, pt-BR by default and en via x-lang', async () => {
    const csrf = await getCsrf();

    const ptResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', csrf.cookieHeader)
      .set(CSRF_HEADER, csrf.token)
      .send({ email: ADMIN_CREDENTIALS.email })
      .expect(400);

    expect((ptResponse.body as { message: string[] }).message).toEqual([
      'O campo password é obrigatório',
    ]);

    const enResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', csrf.cookieHeader)
      .set(CSRF_HEADER, csrf.token)
      .set('x-lang', 'en')
      .send({ email: ADMIN_CREDENTIALS.email })
      .expect(400);

    expect((enResponse.body as { message: string[] }).message).toEqual([
      'The password field is required',
    ]);
  });

  it('rejects an unauthenticated request to a protected route with 401', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/users')
      .expect(401);

    const body = response.body as ErrorBody;

    expect(body.statusCode).toBe(401);
    expect(body.message).toBe(PT_BR.unauthenticated);
  });

  it('rotates the refresh token on /auth/refresh, rejects reuse of the old refresh cookie, and revokes the rotated session', async () => {
    const credentials = await createIsolatedUser(app);
    const csrf = await getCsrf();

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', csrf.cookieHeader)
      .set(CSRF_HEADER, csrf.token)
      .send(credentials)
      .expect(200);

    const firstCookieHeader = cookieHeaderFrom(loginResponse);
    const firstCsrfToken = cookieValue(loginResponse, CSRF_COOKIE);

    const refreshResponse = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', firstCookieHeader)
      .set(CSRF_HEADER, firstCsrfToken)
      .expect(200);

    const rotatedRefreshToken = cookieValue(refreshResponse, 'refresh_token');
    const originalRefreshToken = cookieValue(loginResponse, 'refresh_token');

    expect(rotatedRefreshToken).not.toBe(originalRefreshToken);

    // Replaying the ORIGINAL (now-rotated-away) refresh cookie must fail.
    const replayResponse = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', firstCookieHeader)
      .set(CSRF_HEADER, firstCsrfToken)
      .expect(401);

    // The replay is treated as theft, so the rotated session is revoked too.
    const revokedSessionResponse = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeaderFrom(refreshResponse))
      .set(CSRF_HEADER, cookieValue(refreshResponse, CSRF_COOKIE))
      .expect(401);

    // Anti-oracle: reuse is indistinguishable from a missing refresh cookie.
    const missingCookieResponse = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', csrf.cookieHeader)
      .set(CSRF_HEADER, csrf.token)
      .expect(401);

    // Reuse detection also ends the access token of the rotated session.
    await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Cookie', cookieHeaderFrom(refreshResponse))
      .expect(401);

    for (const response of [
      replayResponse,
      revokedSessionResponse,
      missingCookieResponse,
    ]) {
      const body = response.body as ErrorBody;

      expect(body.error).toBe((missingCookieResponse.body as ErrorBody).error);
      expect(body.message).toBe(PT_BR.invalidRefreshToken);
    }
  });

  it('keeps the access token working across a refresh rotation of its own session', async () => {
    const agent = await createAuthAgent(app, ADMIN_CREDENTIALS);

    const refreshResponse = await agent.post('/api/auth/refresh').expect(200);

    await agent.get('/api/users/me').expect(200);
    await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Cookie', cookieHeaderFrom(refreshResponse))
      .expect(200);
  });

  it('logout immediately rejects access tokens copied before it, from this and every other session of the user', async () => {
    const credentials = await createIsolatedUser(app);
    const session = await createAuthAgent(app, credentials);
    const otherSession = await createAuthAgent(app, credentials);

    await session.get('/api/users/me').expect(200);
    await otherSession.get('/api/users/me').expect(200);

    await session.post('/api/auth/logout').expect(200);

    const response = await session.get('/api/users/me').expect(401);

    expect((response.body as ErrorBody).message).toBe(PT_BR.unauthenticated);
    await otherSession.get('/api/users/me').expect(401);

    // Signing in again after logout starts a fresh, working session.
    const nextSession = await createAuthAgent(app, credentials);
    await nextSession.get('/api/users/me').expect(200);
  });

  it('logout clears the auth cookies and revokes the session (a subsequent refresh fails)', async () => {
    const credentials = await createIsolatedUser(app);
    const csrf = await getCsrf();

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', csrf.cookieHeader)
      .set(CSRF_HEADER, csrf.token)
      .send(credentials)
      .expect(200);

    const cookieHeader = cookieHeaderFrom(loginResponse);
    const csrfToken = cookieValue(loginResponse, CSRF_COOKIE);

    const logoutResponse = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookieHeader)
      .set(CSRF_HEADER, csrfToken)
      .expect(200);

    const clearedAccess = findCookie(logoutResponse, 'access_token');
    const clearedRefresh = findCookie(logoutResponse, 'refresh_token');

    expect(clearedAccess).toMatch(/Expires=|Max-Age=0/);
    expect(clearedRefresh).toMatch(/Expires=|Max-Age=0/);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader)
      .set(CSRF_HEADER, csrfToken)
      .expect(401);
  });

  it('enforces the seeded ability grants end-to-end: READ·USER-only user gets 200 on /users but 403 on /roles', async () => {
    const agent = await createAuthAgent(app, USER_CREDENTIALS);

    await agent.get('/api/users').expect(200);
    await agent.get('/api/roles').expect(403);
  });

  it('a 403 from insufficient abilities carries only the missing ability, with localized labels (pt-BR default, en via x-lang)', async () => {
    const agent = await createAuthAgent(app, USER_CREDENTIALS);

    const ptResponse = await agent.get('/api/roles').expect(403);
    const ptBody = ptResponse.body as ErrorBody;

    expect(ptBody.requiredAbilities).toEqual([
      {
        action: 'READ',
        actionLabel: 'Ler',
        subject: 'ROLE',
        subjectLabel: 'Papel',
      },
    ]);

    const enResponse = await agent
      .get('/api/roles')
      .set('x-lang', 'en')
      .expect(403);

    const enBody = enResponse.body as ErrorBody;

    expect(enBody.requiredAbilities).toEqual([
      {
        action: 'READ',
        actionLabel: 'Read',
        subject: 'ROLE',
        subjectLabel: 'Role',
      },
    ]);
  });

  it('admin (full catalog) can reach both /users and /roles', async () => {
    const agent = await createAuthAgent(app, ADMIN_CREDENTIALS);

    await agent.get('/api/users').expect(200);
    await agent.get('/api/roles').expect(200);
  });

  describe('CSRF double-submit protection', () => {
    it('rejects an unsafe request without a matching x-csrf-token header', async () => {
      const csrf = await getCsrf();

      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Cookie', csrf.cookieHeader)
        .set(CSRF_HEADER, csrf.token)
        .send(ADMIN_CREDENTIALS)
        .expect(200);

      const cookieHeader = cookieHeaderFrom(loginResponse);

      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', cookieHeader)
        .expect(403);
    });

    it('rejects an unsafe request with a mismatched x-csrf-token header', async () => {
      const csrf = await getCsrf();

      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Cookie', csrf.cookieHeader)
        .set(CSRF_HEADER, csrf.token)
        .send(ADMIN_CREDENTIALS)
        .expect(200);

      const cookieHeader = cookieHeaderFrom(loginResponse);

      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', cookieHeader)
        .set(CSRF_HEADER, 'not-the-right-token')
        .expect(403);
    });

    it('rejects a tossed csrf_token cookie whose signature was tampered, even when the header matches it', async () => {
      const csrf = await getCsrf();
      const tamperedToken = `${csrf.token.slice(0, -1)}${csrf.token.endsWith('0') ? '1' : '0'}`;

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Cookie', `csrf_token=${tamperedToken}`)
        .set(CSRF_HEADER, tamperedToken)
        .send(ADMIN_CREDENTIALS)
        .expect(403);
    });

    it('rejects an attacker-chosen unsigned csrf_token cookie, even when the header matches it', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Cookie', 'csrf_token=attacker-chosen-token')
        .set(CSRF_HEADER, 'attacker-chosen-token')
        .send(ADMIN_CREDENTIALS)
        .expect(403);
    });

    it('GET /auth/csrf issues a usable, non-httpOnly csrf_token cookie', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/csrf')
        .expect(200);

      const csrfCookie = findCookie(response, CSRF_COOKIE);

      expect(csrfCookie).toBeDefined();
      expect(csrfCookie?.toLowerCase()).not.toContain('httponly');
    });

    it('rejects the four new email-confirmation/password-reset routes without a matching x-csrf-token header', async () => {
      const csrf = await getCsrf();

      await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .set('Cookie', csrf.cookieHeader)
        .send({ email: 'jane@example.com' })
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .set('Cookie', csrf.cookieHeader)
        .send({ token: 'uuid.secret', password: 'StrongPass123!' })
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/users/confirm-email')
        .set('Cookie', csrf.cookieHeader)
        .send({ token: 'uuid.secret' })
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/users/resend-confirmation')
        .set('Cookie', csrf.cookieHeader)
        .send({ email: 'jane@example.com' })
        .expect(403);
    });
  });
});

// `POST /auth/login` and `POST /auth/refresh` are public, so `req.user` is
// never populated; the audit actor must still be the user resolved by the
// use-case.
describe('Auth (e2e) — audit actor regression', () => {
  let app: INestApplication<App>;

  const recordAuditLog = jest.fn<Promise<void>, [AuditRecordInput]>(() =>
    Promise.resolve(),
  );

  const auditLogSpy: AuditLogPort = { record: recordAuditLog };

  const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

  beforeEach(async () => {
    recordAuditLog.mockClear();

    app = await createTestApp({
      override: (builder) =>
        builder.overrideProvider(AUDIT_LOG_PORT).useValue(auditLogSpy),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  async function getCsrf(): Promise<{ cookieHeader: string; token: string }> {
    const response = await request(app.getHttpServer())
      .get('/api/auth/csrf')
      .expect(200);

    return {
      cookieHeader: cookieHeaderFrom(response),
      token: cookieValue(response, CSRF_COOKIE),
    };
  }

  it('records the authenticated user uuid as the actor on POST /auth/refresh', async () => {
    const csrfResponse = await request(app.getHttpServer())
      .get('/api/auth/csrf')
      .expect(200);

    const csrfCookieHeader = cookieHeaderFrom(csrfResponse);
    const csrfToken = cookieValue(csrfResponse, CSRF_COOKIE);

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', csrfCookieHeader)
      .set(CSRF_HEADER, csrfToken)
      .send(ADMIN_CREDENTIALS)
      .expect(200);

    const loggedInUuid = (loginResponse.body as EnvelopeBody<UserShape>).data
      .uuid;

    const refreshCookieHeader = cookieHeaderFrom(loginResponse);
    const refreshCsrfToken = cookieValue(loginResponse, CSRF_COOKIE);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookieHeader)
      .set(CSRF_HEADER, refreshCsrfToken)
      .expect(200);

    // `AuditInterceptor` persists on `res.once('finish', ...)`, after the
    // response is sent.
    await wait(50);

    const refreshRecords = recordAuditLog.mock.calls
      .map(([input]) => input)
      .filter((input) => input.action === 'Auth.refresh');

    expect(refreshRecords).toHaveLength(1);
    expect(refreshRecords[0]).toEqual(
      expect.objectContaining({
        action: 'Auth.refresh',
        outcome: AuditOutcome.SUCCESS,
        statusCode: 200,
        userId: loggedInUuid,
      }),
    );
  });

  it('records the authenticated user uuid as the actor on a successful POST /auth/login', async () => {
    const csrf = await getCsrf();

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', csrf.cookieHeader)
      .set(CSRF_HEADER, csrf.token)
      .send(ADMIN_CREDENTIALS)
      .expect(200);

    const loggedInUuid = (loginResponse.body as EnvelopeBody<UserShape>).data
      .uuid;

    await wait(50);

    const loginRecords = recordAuditLog.mock.calls
      .map(([input]) => input)
      .filter((input) => input.action === 'Auth.login');

    expect(loginRecords).toHaveLength(1);
    expect(loginRecords[0]).toEqual(
      expect.objectContaining({
        action: 'Auth.login',
        outcome: AuditOutcome.SUCCESS,
        statusCode: 200,
        userId: loggedInUuid,
      }),
    );
  });

  it('records a null actor on a failed POST /auth/login', async () => {
    const csrf = await getCsrf();

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', csrf.cookieHeader)
      .set(CSRF_HEADER, csrf.token)
      .send({ email: ADMIN_CREDENTIALS.email, password: 'wrong-password' })
      .expect(401);

    await wait(50);

    const loginRecords = recordAuditLog.mock.calls
      .map(([input]) => input)
      .filter((input) => input.action === 'Auth.login');

    expect(loginRecords).toHaveLength(1);
    expect(loginRecords[0]).toEqual(
      expect.objectContaining({
        action: 'Auth.login',
        outcome: AuditOutcome.FAILURE,
        statusCode: 401,
        userId: null,
      }),
    );
  });
});

// Overrides `USER_NOTIFIER` with a capturing double so the test can read the
// tokens that would otherwise only be logged.
describe('Auth (e2e) — password reset flow', () => {
  let app: INestApplication<App>;

  const capturedConfirmationTokens = new Map<string, string>();
  const capturedResetTokens = new Map<string, string>();

  const sendEmailConfirmation = jest.fn(
    (input: { email: string; token: string }): Promise<void> => {
      capturedConfirmationTokens.set(input.email, input.token);
      return Promise.resolve();
    },
  );

  const sendPasswordReset = jest.fn(
    (input: { email: string; token: string }): Promise<void> => {
      capturedResetTokens.set(input.email, input.token);
      return Promise.resolve();
    },
  );

  const capturingNotifier: UserNotifier = {
    sendEmailConfirmation,
    sendPasswordReset,
    sendUserChangeRequest: () => Promise.resolve(),
    sendEmailChangeNotice: () => Promise.resolve(),
  };

  const PT_BR_RESET = {
    passwordResetRequested:
      'Se o e-mail estiver cadastrado, um link de redefinição será enviado',
    passwordReset: 'Senha redefinida com sucesso',
    invalidResetToken: 'Token de redefinição de senha inválido ou expirado',
    invalidCredentials: 'E-mail ou senha inválidos',
  };

  interface EnvelopeBodyLocal<T> {
    data: T;
    meta: Record<string, unknown>;
  }

  interface ErrorBodyLocal {
    statusCode: number;
    message: string;
  }

  beforeEach(async () => {
    capturedConfirmationTokens.clear();
    capturedResetTokens.clear();
    sendEmailConfirmation.mockClear();
    sendPasswordReset.mockClear();

    app = await createTestApp({
      override: (builder) =>
        builder.overrideProvider(USER_NOTIFIER).useValue(capturingNotifier),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  async function getCsrf(): Promise<{ cookieHeader: string; token: string }> {
    const response = await request(app.getHttpServer())
      .get('/api/auth/csrf')
      .expect(200);

    return {
      cookieHeader: cookieHeaderFrom(response),
      token: cookieValue(response, CSRF_COOKIE),
    };
  }

  it('rejects a weak new password with a translated 400 before checking the token', async () => {
    const csrf = await getCsrf();

    const response = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .set('Cookie', csrf.cookieHeader)
      .set(CSRF_HEADER, csrf.token)
      .set('x-lang', 'en')
      .send({ token: 'not-a-real-token', password: 'StrongPass123' })
      .expect(400);

    expect((response.body as { message: string[] }).message).toEqual([
      'The password field must contain an uppercase letter, a lowercase letter, a number, and a symbol',
    ]);
  });

  it('resets a password end-to-end: identical generic 200 for known/unknown emails, old password stops working, new one works, and every prior session is revoked', async () => {
    const adminAgent = await createAuthAgent(app, ADMIN_CREDENTIALS);

    const rolesResponse = await adminAgent.get('/api/roles').expect(200);

    const roles = (
      rolesResponse.body as EnvelopeBodyLocal<
        Array<{ uuid: string; role: string }>
      >
    ).data;

    const userRoleUuid = roles.find((role) => role.role === 'USER')?.uuid;

    if (!userRoleUuid) {
      throw new Error('Seeded USER role not found — did seeds run?');
    }

    const email = `reset-flow-${randomUUID()}@example.com`;
    const originalPassword = 'StrongPass123!';
    const newPassword = 'EvenStrongerPass456!';

    const createResponse = await adminAgent
      .post('/api/users')
      .send({
        name: 'Reset Flow User',
        email,
        password: originalPassword,
        roleUuids: [userRoleUuid],
      })
      .expect(201);

    const createdUuid = (
      createResponse.body as EnvelopeBodyLocal<{ uuid: string }>
    ).data.uuid;

    // Confirm the email so the user can log in at all.
    await deliverQueuedEmails(app, email);
    const confirmationToken = capturedConfirmationTokens.get(email);
    expect(confirmationToken).toBeDefined();

    await adminAgent
      .post('/api/users/confirm-email')
      .send({ token: confirmationToken })
      .expect(200);

    // Log in as the new user BEFORE the reset, to capture a refresh session
    // that the reset must revoke.
    const preResetCsrf = await getCsrf();

    const preResetLoginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', preResetCsrf.cookieHeader)
      .set(CSRF_HEADER, preResetCsrf.token)
      .send({ email, password: originalPassword })
      .expect(200);

    const preResetCookieHeader = cookieHeaderFrom(preResetLoginResponse);
    const preResetCsrfToken = cookieValue(preResetLoginResponse, CSRF_COOKIE);

    await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Cookie', preResetCookieHeader)
      .expect(200);

    // Forgot-password returns the identical generic body for a known and an
    // unknown email (anti-enumeration).
    const knownCsrf = await getCsrf();

    const knownResponse = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .set('Cookie', knownCsrf.cookieHeader)
      .set(CSRF_HEADER, knownCsrf.token)
      .send({ email })
      .expect(200);

    const unknownCsrf = await getCsrf();

    const unknownResponse = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .set('Cookie', unknownCsrf.cookieHeader)
      .set(CSRF_HEADER, unknownCsrf.token)
      .send({ email: `unknown-${randomUUID()}@example.com` })
      .expect(200);

    expect(knownResponse.body).toEqual(unknownResponse.body);
    expect((knownResponse.body as EnvelopeBodyLocal<null>).meta.message).toBe(
      PT_BR_RESET.passwordResetRequested,
    );

    await expect(deliverQueuedEmails(app, email)).resolves.toBe(1);
    expect(sendPasswordReset).toHaveBeenCalledTimes(1);
    const resetToken = capturedResetTokens.get(email);
    expect(resetToken).toBeDefined();

    const invalidTokenCsrf = await getCsrf();

    const invalidTokenResponse = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .set('Cookie', invalidTokenCsrf.cookieHeader)
      .set(CSRF_HEADER, invalidTokenCsrf.token)
      .send({ token: 'not-a-real-token', password: newPassword })
      .expect(422);

    expect((invalidTokenResponse.body as ErrorBodyLocal).message).toBe(
      PT_BR_RESET.invalidResetToken,
    );

    const resetCsrf = await getCsrf();

    const resetResponse = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .set('Cookie', resetCsrf.cookieHeader)
      .set(CSRF_HEADER, resetCsrf.token)
      .send({ token: resetToken, password: newPassword })
      .expect(200);

    expect((resetResponse.body as EnvelopeBodyLocal<null>).meta.message).toBe(
      PT_BR_RESET.passwordReset,
    );

    const oldPasswordCsrf = await getCsrf();

    const oldPasswordResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', oldPasswordCsrf.cookieHeader)
      .set(CSRF_HEADER, oldPasswordCsrf.token)
      .send({ email, password: originalPassword })
      .expect(401);

    expect((oldPasswordResponse.body as ErrorBodyLocal).message).toBe(
      PT_BR_RESET.invalidCredentials,
    );

    const newPasswordCsrf = await getCsrf();

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', newPasswordCsrf.cookieHeader)
      .set(CSRF_HEADER, newPasswordCsrf.token)
      .send({ email, password: newPassword })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', preResetCookieHeader)
      .set(CSRF_HEADER, preResetCsrfToken)
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Cookie', preResetCookieHeader)
      .expect(401);

    await adminAgent.delete(`/api/users/${createdUuid}`).expect(200);
  });
});
