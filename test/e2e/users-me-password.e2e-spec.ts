import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  USER_NOTIFIER,
  type UserNotifier,
} from '@modules/users/application/ports/user-notifier.port';
import {
  type AuthAgent,
  CSRF_COOKIE,
  CSRF_HEADER,
  type Credentials,
  createAuthAgent,
} from './helpers/auth-agent';
import { createTestApp } from './helpers/create-test-app';
import { deliverQueuedEmails } from './helpers/deliver-queued-emails';
import { createIsolatedUser } from './helpers/isolated-user';

interface EnvelopeBody<T> {
  data: T;
  meta: { message?: string };
}

interface ErrorBody {
  statusCode: number;
  message: string;
}

const NEW_PASSWORD = 'N3wStrongPass!';

function setCookies(response: request.Response): string[] {
  const raw: unknown = (response.headers as Record<string, unknown>)[
    'set-cookie'
  ];

  if (Array.isArray(raw)) {
    return raw as string[];
  }

  return typeof raw === 'string' ? [raw] : [];
}

function clearedCookieNames(response: request.Response): string[] {
  return setCookies(response)
    .filter((cookie) => cookie.includes('Expires=Thu, 01 Jan 1970'))
    .map((cookie) => cookie.split('=')[0]);
}

// Every successful PATCH /users/me/password ends all sessions of the caller,
// so each test signs in as an account of its own. Those sign-ins exceed the
// default login rate limit, which this spec raises for its own worker process.
describe('PATCH /users/me/password (e2e)', () => {
  const originalAuthThrottleLimit = process.env.AUTH_THROTTLE_LIMIT;

  let app: INestApplication<App>;

  const resetTokens = new Map<string, string>();

  const notifier: UserNotifier = {
    sendEmailChangeNotice: () => Promise.resolve(),
    sendEmailConfirmation: () => Promise.resolve(),
    sendPasswordReset: ({ email, token }) => {
      resetTokens.set(email, token);
      return Promise.resolve();
    },
    sendUserChangeRequest: () => Promise.resolve(),
  };

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = '1000';

    app = await createTestApp({
      override: (builder) =>
        builder.overrideProvider(USER_NOTIFIER).useValue(notifier),
    });
  });

  afterAll(async () => {
    await app.close();

    if (originalAuthThrottleLimit === undefined) {
      delete process.env.AUTH_THROTTLE_LIMIT;
    } else {
      process.env.AUTH_THROTTLE_LIMIT = originalAuthThrottleLimit;
    }
  });

  async function anonymousCsrf(): Promise<{
    cookies: string[];
    token: string;
  }> {
    const csrf = await request(app.getHttpServer())
      .get('/api/auth/csrf')
      .expect(200);

    const cookies = setCookies(csrf).map((cookie) => cookie.split(';')[0]);

    const token = cookies
      .find((cookie) => cookie.startsWith(`${CSRF_COOKIE}=`))!
      .slice(CSRF_COOKIE.length + 1);

    return { cookies, token };
  }

  async function anonymousPost(
    path: string,
    body: object,
  ): Promise<request.Response> {
    const { cookies, token } = await anonymousCsrf();

    return request(app.getHttpServer())
      .post(path)
      .set('Cookie', cookies.join('; '))
      .set(CSRF_HEADER, token)
      .send(body);
  }

  function attemptLogin(credentials: Credentials): Promise<request.Response> {
    return anonymousPost('/api/auth/login', credentials);
  }

  async function signIn(): Promise<{
    agent: AuthAgent;
    credentials: Credentials;
  }> {
    const credentials = await createIsolatedUser(app);
    const agent = await createAuthAgent(app, credentials);

    return { agent, credentials };
  }

  it('changes the password, ends every session, and only the new password signs in afterwards', async () => {
    const { agent, credentials } = await signIn();
    const otherDevice = await createAuthAgent(app, credentials);

    const response = await agent
      .patch('/api/users/me/password')
      .set('x-lang', 'en')
      .send({
        currentPassword: credentials.password,
        newPassword: NEW_PASSWORD,
      })
      .expect(200);

    const body = response.body as EnvelopeBody<null>;

    expect(body.data).toBeNull();
    expect(body.meta.message).toBe('Password changed successfully');
    expect(clearedCookieNames(response)).toEqual(
      expect.arrayContaining(['access_token', 'refresh_token']),
    );

    for (const session of [agent, otherDevice]) {
      await session.get('/api/users/me').expect(401);
      await session.post('/api/auth/refresh').expect(401);
    }

    expect((await attemptLogin(credentials)).status).toBe(401);

    const fresh = await createAuthAgent(app, {
      email: credentials.email,
      password: NEW_PASSWORD,
    });

    await fresh.get('/api/users/me').expect(200);
  });

  it('localizes the success message', async () => {
    const { agent, credentials } = await signIn();

    const response = await agent
      .patch('/api/users/me/password')
      .set('x-lang', 'pt-BR')
      .send({
        currentPassword: credentials.password,
        newPassword: NEW_PASSWORD,
      })
      .expect(200);

    expect((response.body as EnvelopeBody<null>).meta.message).toBe(
      'Senha alterada com sucesso',
    );
  });

  it('accepts a new password equal to the current one and still ends every session', async () => {
    const { agent, credentials } = await signIn();

    const response = await agent
      .patch('/api/users/me/password')
      .send({
        currentPassword: credentials.password,
        newPassword: credentials.password,
      })
      .expect(200);

    expect(clearedCookieNames(response)).toEqual(
      expect.arrayContaining(['access_token', 'refresh_token']),
    );
    await agent.get('/api/users/me').expect(401);
    expect((await attemptLogin(credentials)).status).toBe(200);
  });

  it('rejects a wrong current password with 403, not 401, and keeps the password and the session', async () => {
    const { agent, credentials } = await signIn();

    const response = await agent
      .patch('/api/users/me/password')
      .set('x-lang', 'en')
      .send({ currentPassword: 'NotThePassword1!', newPassword: NEW_PASSWORD })
      .expect(403);

    expect((response.body as ErrorBody).message).toBe(
      'The current password is incorrect',
    );
    expect(clearedCookieNames(response)).toEqual([]);
    await agent.get('/api/users/me').expect(200);
    expect((await attemptLogin(credentials)).status).toBe(200);
  });

  it('voids a password-reset link requested before the change', async () => {
    const { agent, credentials } = await signIn();

    await anonymousPost('/api/auth/forgot-password', {
      email: credentials.email,
    }).then((response) => expect(response.status).toBe(200));
    await deliverQueuedEmails(app, credentials.email);

    const resetToken = resetTokens.get(credentials.email);
    expect(resetToken).toBeDefined();

    await agent
      .patch('/api/users/me/password')
      .send({
        currentPassword: credentials.password,
        newPassword: NEW_PASSWORD,
      })
      .expect(200);

    const reset = await anonymousPost('/api/auth/reset-password', {
      token: resetToken,
      password: 'Hijacked123!',
    });

    expect(reset.status).toBe(422);
    expect(
      (
        await attemptLogin({
          email: credentials.email,
          password: NEW_PASSWORD,
        })
      ).status,
    ).toBe(200);
  });

  it.each([
    {
      scenario: 'a missing current password',
      body: { newPassword: NEW_PASSWORD },
    },
    {
      scenario: 'an empty current password',
      body: { currentPassword: '', newPassword: NEW_PASSWORD },
    },
    { scenario: 'a missing new password', body: { currentPassword: 'x' } },
    {
      scenario: 'a new password under 8 characters',
      body: { currentPassword: 'x', newPassword: 'Short1!' },
    },
    {
      scenario: 'a new password over 128 characters',
      body: { currentPassword: 'x', newPassword: 'Aa1!'.padEnd(129, 'a') },
    },
    {
      scenario: 'a new password without a lowercase letter',
      body: { currentPassword: 'x', newPassword: 'N3WSTRONGPASS!' },
    },
    {
      scenario: 'a new password without an uppercase letter',
      body: { currentPassword: 'x', newPassword: 'n3wstrongpass!' },
    },
    {
      scenario: 'a new password without a digit',
      body: { currentPassword: 'x', newPassword: 'NewStrongPass!' },
    },
    {
      scenario: 'a new password without a symbol',
      body: { currentPassword: 'x', newPassword: 'N3wStrongPass' },
    },
    {
      scenario: 'a current password over 128 characters',
      body: { currentPassword: 'a'.repeat(129), newPassword: NEW_PASSWORD },
    },
    {
      scenario: 'a non-string new password',
      body: { currentPassword: 'x', newPassword: 12345678 },
    },
  ])('rejects $scenario with 400 and keeps the session', async ({ body }) => {
    const { agent } = await signIn();

    const response = await agent
      .patch('/api/users/me/password')
      .send(body)
      .expect(400);

    expect(clearedCookieNames(response)).toEqual([]);
    await agent.get('/api/users/me').expect(200);
  });

  it('reports a weak new password with a localized 400, pt-BR by default and en via x-lang', async () => {
    const { agent } = await signIn();

    const ptResponse = await agent
      .patch('/api/users/me/password')
      .send({ currentPassword: 'x', newPassword: 'newstrongpass' })
      .expect(400);

    expect((ptResponse.body as { message: string[] }).message).toEqual([
      'O campo newPassword deve conter uma letra maiúscula, uma letra minúscula, um número e um símbolo',
    ]);

    const enResponse = await agent
      .patch('/api/users/me/password')
      .set('x-lang', 'en')
      .send({ currentPassword: 'x', newPassword: 'newstrongpass' })
      .expect(400);

    expect((enResponse.body as { message: string[] }).message).toEqual([
      'The newPassword field must contain an uppercase letter, a lowercase letter, a number, and a symbol',
    ]);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const { cookies, token } = await anonymousCsrf();

    await request(app.getHttpServer())
      .patch('/api/users/me/password')
      .set('Cookie', cookies.join('; '))
      .set(CSRF_HEADER, token)
      .send({ currentPassword: 'Secret123!', newPassword: NEW_PASSWORD })
      .expect(401);
  });

  it('rejects a request without the CSRF token with 403', async () => {
    const { agent } = await signIn();

    await agent
      .patch('/api/users/me/password')
      .unset(CSRF_HEADER)
      .send({ currentPassword: 'Secret123!', newPassword: NEW_PASSWORD })
      .expect(403);
  });

  // A separate app reads the default-sized login budget, since the shared one
  // runs with a raised limit.
  it('rate-limits current-password guesses like login', async () => {
    const credentials = await createIsolatedUser(app);

    process.env.AUTH_THROTTLE_LIMIT = '2';
    const throttledApp = await createTestApp();
    process.env.AUTH_THROTTLE_LIMIT = '1000';

    try {
      const agent = await createAuthAgent(throttledApp, credentials);

      const guess = () =>
        agent.patch('/api/users/me/password').send({
          currentPassword: `Wrong-${randomUUID()}`,
          newPassword: NEW_PASSWORD,
        });

      await guess().expect(403);
      await guess().expect(403);
      await guess().expect(429);
    } finally {
      await throttledApp.close();
    }
  });
});
