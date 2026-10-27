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

interface ProfileValuesShape {
  name: string;
  email: string;
  roles: RoleShape[];
}

interface ChangeRequestShape {
  uuid: string;
  status: string;
  statusLabel: string;
  requesterName: string | null;
  current: ProfileValuesShape;
  requested: ProfileValuesShape;
  expiresAt: string;
}

interface UserShape {
  uuid: string;
  name: string;
  email: string;
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

describe('Admin change requests (e2e)', () => {
  let app: INestApplication<App>;
  let requester: AuthAgent;
  let target: AuthAgent;
  let targetUser: UserShape;
  let adminRoleUuid: string;
  let userRoleUuid: string;

  const confirmationTokens = new Map<string, string>();
  const sendUserChangeRequest = jest.fn(() => Promise.resolve());

  const notifier: UserNotifier = {
    sendEmailConfirmation: ({ email, token }) => {
      confirmationTokens.set(email, token);
      return Promise.resolve();
    },
    sendPasswordReset: () => Promise.resolve(),
    sendUserChangeRequest,
    sendEmailChangeNotice: () => Promise.resolve(),
  };

  beforeEach(async () => {
    sendUserChangeRequest.mockClear();

    app = await createTestApp({
      override: (builder) =>
        builder.overrideProvider(USER_NOTIFIER).useValue(notifier),
    });

    requester = await createAuthAgent(app);

    const roles = (
      (await requester.get('/api/roles').expect(200)).body as EnvelopeBody<
        RoleShape[]
      >
    ).data;

    adminRoleUuid = roles.find((role) => role.role === 'ADMIN')!.uuid;
    userRoleUuid = roles.find((role) => role.role === 'USER')!.uuid;

    const email = `second-admin-${randomUUID()}@example.com`;

    targetUser = (
      (
        await requester
          .post('/api/users')
          .send({
            name: 'Second Admin',
            email,
            password: PASSWORD,
            roleUuids: [adminRoleUuid],
          })
          .expect(201)
      ).body as EnvelopeBody<UserShape>
    ).data;

    await deliverQueuedEmails(app, email);
    await requester
      .post('/api/users/confirm-email')
      .send({ token: confirmationTokens.get(email) })
      .expect(200);

    target = await createAuthAgent(app, { email, password: PASSWORD });
  });

  afterEach(async () => {
    await requester.delete(`/api/users/${targetUser.uuid}`).expect(200);
    await app.close();
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

  function requestChange(roleUuids: string[]) {
    return requester
      .post(`/api/users/${targetUser.uuid}/change-requests`)
      .set('x-lang', 'en')
      .send({ name: 'Renamed Admin', email: targetUser.email, roleUuids });
  }

  it('routes an edit of another admin through an approval that shows current and requested values', async () => {
    const patchResponse = await requester
      .patch(`/api/users/${targetUser.uuid}`)
      .set('x-lang', 'en')
      .send({
        name: 'Renamed Admin',
        email: targetUser.email,
        roleUuids: [adminRoleUuid],
      })
      .expect(409);

    expect((patchResponse.body as ErrorBody).message).toBe(
      'Changes to another admin require their approval; submit a change request instead',
    );

    const created = (
      (await requestChange([adminRoleUuid, userRoleUuid]).expect(201))
        .body as EnvelopeBody<ChangeRequestShape>
    ).data;

    expect(created.status).toBe('PENDING');
    expect(created.statusLabel).toBe('Pending');

    await expect(deliverQueuedEmails(app, targetUser.email)).resolves.toBe(1);
    expect(sendUserChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ email: targetUser.email }),
    );

    const pending = (
      (await target.get('/api/users/me/change-requests').expect(200))
        .body as EnvelopeBody<ChangeRequestShape[]>
    ).data;

    expect(pending).toHaveLength(1);
    expect(pending[0].uuid).toBe(created.uuid);
    expect(pending[0].current.name).toBe('Second Admin');
    expect(pending[0].current.roles.map((role) => role.role)).toEqual([
      'ADMIN',
    ]);
    expect(pending[0].requested.name).toBe('Renamed Admin');
    expect(pending[0].requested.roles.map((role) => role.role).sort()).toEqual([
      'ADMIN',
      'USER',
    ]);

    const unchanged = (
      (await requester.get(`/api/users/${targetUser.uuid}`).expect(200))
        .body as EnvelopeBody<UserShape>
    ).data;

    expect(unchanged.name).toBe('Second Admin');

    await requester
      .post(`/api/users/me/change-requests/${created.uuid}/approve`)
      .expect(404);

    const approved = (
      await target
        .post(`/api/users/me/change-requests/${created.uuid}/approve`)
        .expect(200)
    ).body as EnvelopeBody<UserShape>;

    expect(approved.data.name).toBe('Renamed Admin');
    expect(approved.data.roles.map((role) => role.role).sort()).toEqual([
      'ADMIN',
      'USER',
    ]);

    const relogged = await createAuthAgent(app, {
      email: targetUser.email,
      password: PASSWORD,
    });

    await relogged
      .post(`/api/users/me/change-requests/${created.uuid}/approve`)
      .expect(409);
  });

  it('lets the target reject a request without applying it', async () => {
    const created = (
      (await requestChange([adminRoleUuid]).expect(201))
        .body as EnvelopeBody<ChangeRequestShape>
    ).data;

    const rejected = await target
      .post(`/api/users/me/change-requests/${created.uuid}/reject`)
      .set('x-lang', 'en')
      .expect(200);

    expect((rejected.body as EnvelopeBody<null>).meta.message).toBe(
      'Change request rejected',
    );
    expect(
      (
        (await target.get('/api/users/me/change-requests').expect(200))
          .body as EnvelopeBody<ChangeRequestShape[]>
      ).data,
    ).toEqual([]);

    const user = (
      (await target.get('/api/users/me').expect(200))
        .body as EnvelopeBody<UserShape>
    ).data;

    expect(user.name).toBe('Second Admin');
  });

  it('refuses the change request routes to a user who does not hold ADMIN', async () => {
    const created = (
      (await requestChange([adminRoleUuid]).expect(201))
        .body as EnvelopeBody<ChangeRequestShape>
    ).data;

    const email = `regular-user-${randomUUID()}@example.com`;

    const regularUser = (
      (
        await requester
          .post('/api/users')
          .send({
            name: 'Regular User',
            email,
            password: PASSWORD,
            roleUuids: [userRoleUuid],
          })
          .expect(201)
      ).body as EnvelopeBody<UserShape>
    ).data;

    await deliverQueuedEmails(app, email);
    await requester
      .post('/api/users/confirm-email')
      .send({ token: confirmationTokens.get(email) })
      .expect(200);
    const regular = await createAuthAgent(app, { email, password: PASSWORD });

    const listed = await regular
      .get('/api/users/me/change-requests')
      .set('x-lang', 'en')
      .expect(403);

    expect((listed.body as { message: string }).message).toBe(
      'Only admins receive change requests',
    );
    await regular
      .post(`/api/users/me/change-requests/${created.uuid}/approve`)
      .expect(403);
    await regular
      .post(`/api/users/me/change-requests/${created.uuid}/reject`)
      .expect(403);

    await requester.delete(`/api/users/${regularUser.uuid}`).expect(200);
  });

  it('never lets ADMIN be removed, by another admin or by the admin themselves', async () => {
    const byOther = await requestChange([userRoleUuid]).expect(403);
    expect((byOther.body as ErrorBody).message).toBe(
      'The ADMIN role cannot be removed',
    );

    await target
      .patch(`/api/users/${targetUser.uuid}`)
      .send({
        name: targetUser.name,
        email: targetUser.email,
        roleUuids: [userRoleUuid],
      })
      .expect(403);
  });

  it('applies an admin self-edit directly', async () => {
    const response = await target
      .patch(`/api/users/${targetUser.uuid}`)
      .send({
        name: 'Self Renamed',
        email: targetUser.email,
        roleUuids: [adminRoleUuid],
      })
      .expect(200);

    expect((response.body as EnvelopeBody<UserShape>).data.name).toBe(
      'Self Renamed',
    );
  });

  it('rejects a change request an admin files against themselves', async () => {
    const own = await target
      .post(`/api/users/${targetUser.uuid}/change-requests`)
      .set('x-lang', 'en')
      .send({
        name: 'Self Request',
        email: targetUser.email,
        roleUuids: [adminRoleUuid],
      })
      .expect(409);

    expect((own.body as ErrorBody).message).toBe(
      'Change requests apply only to another admin; update this user directly',
    );
  });

  it('ends every session of an admin who edits their own profile', async () => {
    const credentials = { email: targetUser.email, password: PASSWORD };
    const otherDevice = await createAuthAgent(app, credentials);

    const response = await target
      .patch(`/api/users/${targetUser.uuid}`)
      .send({ name: 'Self Renamed' })
      .expect(200);

    expect(clearedCookieNames(response)).toEqual(
      expect.arrayContaining(['access_token', 'refresh_token']),
    );
    await target.post('/api/auth/refresh').expect(401);
    await otherDevice.get('/api/users/me').expect(401);
    await otherDevice.post('/api/auth/refresh').expect(401);

    const fresh = await createAuthAgent(app, credentials);
    await fresh.post('/api/auth/refresh').expect(200);
  });

  it('ends every session on approval and requires a changed email to be confirmed before the next login', async () => {
    const newEmail = `approved-${randomUUID()}@example.com`;

    const created = (
      (
        await requester
          .post(`/api/users/${targetUser.uuid}/change-requests`)
          .send({ email: newEmail })
          .expect(201)
      ).body as EnvelopeBody<ChangeRequestShape>
    ).data;

    const response = await target
      .post(`/api/users/me/change-requests/${created.uuid}/approve`)
      .expect(200);

    expect(clearedCookieNames(response)).toEqual(
      expect.arrayContaining(['access_token', 'refresh_token']),
    );
    await target.post('/api/auth/refresh').expect(401);
    await target.get('/api/users/me').expect(401);

    const credentials = { email: newEmail, password: PASSWORD };
    const unconfirmed = await attemptLogin(credentials);
    expect(unconfirmed.status).toBe(403);

    await deliverQueuedEmails(app, newEmail);
    await requester
      .post('/api/users/confirm-email')
      .send({ token: confirmationTokens.get(newEmail) })
      .expect(200);

    expect((await attemptLogin(credentials)).status).toBe(200);
  });
});
