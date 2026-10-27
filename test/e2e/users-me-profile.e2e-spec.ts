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

interface RoleShape {
  uuid: string;
  role: string;
}

interface UserShape {
  uuid: string;
  name: string;
  email: string;
  status: string;
  emailConfirmedAt: string | null;
  roles: RoleShape[];
}

const PASSWORD = 'StrongPass123!';

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

// Every successful PATCH /users/me ends all sessions of the caller, so each
// test signs in as an account of its own instead of the shared seed accounts.
// Those sign-ins exceed the default login rate limit, which this spec raises
// for its own worker process.
describe('PATCH /users/me (e2e)', () => {
  const originalAuthThrottleLimit = process.env.AUTH_THROTTLE_LIMIT;

  let app: INestApplication<App>;
  let admin: AuthAgent;
  let adminRoleUuid: string;

  const confirmationTokens = new Map<string, string>();
  const changeNotices: Array<{ email: string; locale: string }> = [];

  const notifier: UserNotifier = {
    sendEmailChangeNotice: (input) => {
      changeNotices.push(input);
      return Promise.resolve();
    },
    sendEmailConfirmation: ({ email, token }) => {
      confirmationTokens.set(email, token);
      return Promise.resolve();
    },
    sendPasswordReset: () => Promise.resolve(),
    sendUserChangeRequest: () => Promise.resolve(),
  };

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = '1000';

    app = await createTestApp({
      override: (builder) =>
        builder.overrideProvider(USER_NOTIFIER).useValue(notifier),
    });

    admin = await createAuthAgent(app);

    const roles = (
      (await admin.get('/api/roles').expect(200)).body as EnvelopeBody<
        RoleShape[]
      >
    ).data;

    adminRoleUuid = roles.find((role) => role.role === 'ADMIN')!.uuid;
  });

  afterAll(async () => {
    await app.close();

    if (originalAuthThrottleLimit === undefined) {
      delete process.env.AUTH_THROTTLE_LIMIT;
    } else {
      process.env.AUTH_THROTTLE_LIMIT = originalAuthThrottleLimit;
    }
  });

  async function attemptLogin(
    credentials: Credentials,
  ): Promise<request.Response> {
    const server = app.getHttpServer();
    const csrf = await request(server).get('/api/auth/csrf').expect(200);
    const cookies = setCookies(csrf).map((cookie) => cookie.split(';')[0]);

    const token = cookies
      .find((cookie) => cookie.startsWith(`${CSRF_COOKIE}=`))!
      .slice(CSRF_COOKIE.length + 1);

    return request(server)
      .post('/api/auth/login')
      .set('Cookie', cookies.join('; '))
      .set(CSRF_HEADER, token)
      .send(credentials);
  }

  async function signInAsRegularUser(): Promise<{
    agent: AuthAgent;
    credentials: Credentials;
    profile: UserShape;
  }> {
    const credentials = await createIsolatedUser(app);
    const agent = await createAuthAgent(app, credentials);

    const profile = (
      (await agent.get('/api/users/me').expect(200))
        .body as EnvelopeBody<UserShape>
    ).data;

    return { agent, credentials, profile };
  }

  async function createConfirmedAdmin(): Promise<{
    credentials: Credentials;
    profile: UserShape;
  }> {
    const email = `self-admin-${randomUUID()}@example.com`;

    const profile = (
      (
        await admin
          .post('/api/users')
          .send({
            name: 'Self Admin',
            email,
            password: PASSWORD,
            roleUuids: [adminRoleUuid],
          })
          .expect(201)
      ).body as EnvelopeBody<UserShape>
    ).data;

    await deliverQueuedEmails(app, email);
    await admin
      .post('/api/users/confirm-email')
      .send({ token: confirmationTokens.get(email) })
      .expect(200);

    return { credentials: { email, password: PASSWORD }, profile };
  }

  async function expectSessionEnded(
    response: request.Response,
    agents: AuthAgent[],
  ): Promise<void> {
    expect(clearedCookieNames(response)).toEqual(
      expect.arrayContaining(['access_token', 'refresh_token']),
    );

    for (const agent of agents) {
      await agent.get('/api/users/me').expect(401);
      await agent.post('/api/auth/refresh').expect(401);
    }
  }

  describe('as a regular user without the UPDATE ability', () => {
    it('cannot use PATCH /users/:uuid on their own profile', async () => {
      const { agent, profile } = await signInAsRegularUser();

      await agent
        .patch(`/api/users/${profile.uuid}`)
        .send({ name: 'Blocked' })
        .expect(403);
    });

    it('updates their own name and ends every session, so they must log in again', async () => {
      const { agent, credentials, profile } = await signInAsRegularUser();
      const otherDevice = await createAuthAgent(app, credentials);

      const response = await agent
        .patch('/api/users/me')
        .set('x-lang', 'en')
        .send({ name: 'Renamed Self' })
        .expect(200);

      const body = response.body as EnvelopeBody<UserShape>;

      expect(body.data).toMatchObject({
        uuid: profile.uuid,
        name: 'Renamed Self',
        email: profile.email,
      });
      expect(body.data.emailConfirmedAt).not.toBeNull();
      expect(body.data).not.toHaveProperty('password');
      expect(body.meta.message).toBeDefined();

      await expectSessionEnded(response, [agent, otherDevice]);

      const fresh = await createAuthAgent(app, credentials);

      const me = (
        (await fresh.get('/api/users/me').expect(200))
          .body as EnvelopeBody<UserShape>
      ).data;

      expect(me.name).toBe('Renamed Self');
    });

    it('ends every session on an empty body too', async () => {
      const { agent } = await signInAsRegularUser();

      const response = await agent.patch('/api/users/me').send({}).expect(200);

      await expectSessionEnded(response, [agent]);
    });

    it('ignores roles, status, password, and other protected fields', async () => {
      const { agent, credentials, profile } = await signInAsRegularUser();

      const response = await agent
        .patch('/api/users/me')
        .send({
          name: 'Still Regular',
          roleUuids: [adminRoleUuid],
          status: 'INACTIVE',
          password: 'Hijacked123!',
          emailConfirmedAt: null,
          uuid: randomUUID(),
          deletedAt: new Date().toISOString(),
        })
        .expect(200);

      const updated = (response.body as EnvelopeBody<UserShape>).data;

      expect(updated.uuid).toBe(profile.uuid);
      expect(updated.name).toBe('Still Regular');
      expect(updated.status).toBe(profile.status);
      expect(updated.emailConfirmedAt).toBe(profile.emailConfirmedAt);
      expect(updated.roles).toEqual(profile.roles);
      expect(updated.roles.map((role) => role.role)).not.toContain('ADMIN');

      const hijacked = await attemptLogin({
        email: credentials.email,
        password: 'Hijacked123!',
      });

      expect(hijacked.status).toBe(401);

      const fresh = await createAuthAgent(app, credentials);
      await fresh.get('/api/roles').expect(403);
    });

    it('requires the current password to change the email, and keeps the session when it is missing or wrong', async () => {
      const { agent, credentials, profile } = await signInAsRegularUser();
      const newEmail = `self-changed-${randomUUID()}@example.com`;

      const missing = await agent
        .patch('/api/users/me')
        .set('x-lang', 'en')
        .send({ email: newEmail })
        .expect(422);

      expect((missing.body as ErrorBody).message).toBe(
        'Enter your current password to change the email',
      );

      const wrong = await agent
        .patch('/api/users/me')
        .set('x-lang', 'en')
        .send({ email: newEmail, currentPassword: 'NotThePassword1!' })
        .expect(403);

      expect((wrong.body as ErrorBody).message).toBe(
        'The current password is incorrect',
      );

      for (const response of [missing, wrong]) {
        expect(clearedCookieNames(response)).toEqual([]);
      }

      const me = (
        (await agent.get('/api/users/me').expect(200))
          .body as EnvelopeBody<UserShape>
      ).data;

      expect(me.email).toBe(profile.email);
      expect(await deliverQueuedEmails(app, credentials.email)).toBe(0);
      expect(await deliverQueuedEmails(app, newEmail)).toBe(0);
    });

    it('requires a changed email to be confirmed before the next login, and notifies the previous address', async () => {
      const { agent, credentials } = await signInAsRegularUser();
      const newEmail = `self-changed-${randomUUID()}@example.com`;

      const response = await agent
        .patch('/api/users/me')
        .set('x-lang', 'en')
        .send({
          email: ` ${newEmail.toUpperCase()} `,
          currentPassword: credentials.password,
        })
        .expect(200);

      const updated = (response.body as EnvelopeBody<UserShape>).data;

      expect(updated.email).toBe(newEmail);
      expect(updated.emailConfirmedAt).toBeNull();
      await expectSessionEnded(response, [agent]);

      const nextCredentials = {
        email: newEmail,
        password: credentials.password,
      };

      expect((await attemptLogin(nextCredentials)).status).toBe(403);
      expect((await attemptLogin(credentials)).status).toBe(401);

      await deliverQueuedEmails(app, credentials.email);
      expect(changeNotices).toContainEqual({
        email: credentials.email,
        locale: 'en',
      });
      expect(changeNotices).not.toContainEqual(
        expect.objectContaining({ email: newEmail }),
      );

      await deliverQueuedEmails(app, newEmail);
      await admin
        .post('/api/users/confirm-email')
        .send({ token: confirmationTokens.get(newEmail) })
        .expect(200);

      expect((await attemptLogin(nextCredentials)).status).toBe(200);
    });

    it('rejects an email already in use with 409 and keeps the session', async () => {
      const { agent, credentials } = await signInAsRegularUser();
      const taken = await createIsolatedUser(app);

      const response = await agent
        .patch('/api/users/me')
        .set('x-lang', 'en')
        .send({ email: taken.email, currentPassword: credentials.password })
        .expect(409);

      expect((response.body as ErrorBody).statusCode).toBe(409);
      expect(clearedCookieNames(response)).toEqual([]);
      await agent.get('/api/users/me').expect(200);
    });

    it.each([
      { field: 'name', value: '   ' },
      { field: 'name', value: null },
      { field: 'email', value: 'not-an-email' },
      { field: 'email', value: null },
      { field: 'currentPassword', value: '' },
    ])(
      'rejects an invalid $field ($value) with 400 and keeps the session',
      async ({ field, value }) => {
        const { agent } = await signInAsRegularUser();

        await agent
          .patch('/api/users/me')
          .send({ [field]: value })
          .expect(400);

        await agent.get('/api/users/me').expect(200);
      },
    );
  });

  describe('as an administrator', () => {
    it('updates their own profile, keeps ADMIN even when the body drops it, and ends every session', async () => {
      const { credentials, profile } = await createConfirmedAdmin();
      const agent = await createAuthAgent(app, credentials);
      const otherDevice = await createAuthAgent(app, credentials);

      try {
        const response = await agent
          .patch('/api/users/me')
          .send({ name: 'Admin Renamed', roleUuids: [] })
          .expect(200);

        const updated = (response.body as EnvelopeBody<UserShape>).data;

        expect(updated.name).toBe('Admin Renamed');
        expect(updated.roles).toEqual(profile.roles);
        await expectSessionEnded(response, [agent, otherDevice]);

        const fresh = await createAuthAgent(app, credentials);
        await fresh.get('/api/roles').expect(200);
      } finally {
        await admin.delete(`/api/users/${profile.uuid}`).expect(200);
      }
    });
  });

  it('rejects an unauthenticated request with 401', async () => {
    const server = app.getHttpServer();
    const csrf = await request(server).get('/api/auth/csrf').expect(200);
    const cookies = setCookies(csrf).map((cookie) => cookie.split(';')[0]);

    const token = cookies
      .find((cookie) => cookie.startsWith(`${CSRF_COOKIE}=`))!
      .slice(CSRF_COOKIE.length + 1);

    await request(server)
      .patch('/api/users/me')
      .set('Cookie', cookies.join('; '))
      .set(CSRF_HEADER, token)
      .send({ name: 'Anonymous' })
      .expect(401);
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
        agent.patch('/api/users/me').send({
          email: `guess-${randomUUID()}@example.com`,
          currentPassword: 'NotThePassword1!',
        });

      await guess().expect(403);
      await guess().expect(403);
      await guess().expect(429);
    } finally {
      await throttledApp.close();
    }
  });
});
