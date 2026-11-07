import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  USER_ABILITY_REPOSITORY,
  type UserAbilityRepository,
} from '@modules/authorization';
import { Action } from '@shared/domain/enums/action.enum';
import { Subject } from '@shared/domain/authorization/subject';
import { createTestApp } from './helpers/create-test-app';
import {
  createAuthAgent,
  CSRF_HEADER,
  type AuthAgent,
} from './helpers/auth-agent';

interface UserResponse {
  data: { uuid: string; email: string; emailConfirmedAt: string | null };
  meta: { message: string };
}

describe('Manual email confirmation (e2e)', () => {
  let app: INestApplication<App>;
  let agent: AuthAgent;
  let uuid: string;
  let email: string;
  let userRoleUuid: string;
  const password = 'StrongPassword123!';

  beforeAll(async () => {
    app = await createTestApp();
    agent = await createAuthAgent(app);
    const rolesResponse = await agent.get('/api/roles').expect(200);

    const roles = (
      rolesResponse.body as { data: Array<{ uuid: string; role: string }> }
    ).data;

    const userRole = roles.find((role) => role.role === 'USER');
    if (!userRole) throw new Error('Missing USER role');
    userRoleUuid = userRole.uuid;
  });

  beforeEach(async () => {
    email = `manual-${randomUUID()}@example.com`;

    const response = await agent
      .post('/api/users')
      .send({
        name: 'Manual confirmation',
        email,
        password,
        roleUuids: [userRoleUuid],
      })
      .expect(201);

    uuid = (response.body as UserResponse).data.uuid;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    const response = await agent.delete(`/api/users/${uuid}`);
    expect([200, 404]).toContain(response.status);
  });

  afterAll(async () => app.close());

  it('enables login, returns the confirmation timestamp in lists, and is idempotent', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', agent.cookieHeader)
      .set(CSRF_HEADER, agent.csrfToken)
      .send({ email, password })
      .expect(403);

    const confirmed = await agent
      .put(`/api/users/${uuid}/email-confirmation`)
      .set('x-lang', 'en')
      .send({ email })
      .expect(200);

    const body = confirmed.body as UserResponse;
    expect(body.data.emailConfirmedAt).toEqual(expect.any(String));
    expect(body.meta.message).toBe('Email confirmed successfully');

    const repeated = await agent
      .put(`/api/users/${uuid}/email-confirmation`)
      .send({ email })
      .expect(200);

    expect((repeated.body as UserResponse).data.emailConfirmedAt).toBe(
      body.data.emailConfirmedAt,
    );
    const list = await agent.get('/api/users').query({ email }).expect(200);
    expect(
      (list.body as { data: UserResponse['data'][] }).data[0].emailConfirmedAt,
    ).toBe(body.data.emailConfirmedAt);
    const signedIn = await createAuthAgent(app, { email, password });
    await signedIn.get('/api/users/me').expect(200);
  });

  it.each([Action.READ, Action.UPDATE])(
    'rejects an actor missing %s on USER',
    async (missing) => {
      const abilities = app.get<UserAbilityRepository>(USER_ABILITY_REPOSITORY);
      const me = await agent.get('/api/users/me').expect(200);

      const grants = await abilities.findGrantedAbilities(
        (me.body as UserResponse).data.uuid,
      );

      jest
        .spyOn(abilities, 'findGrantedAbilities')
        .mockResolvedValue(
          grants.filter(
            ({ action, subject }) =>
              subject !== Subject.USER || action !== missing,
          ),
        );

      await agent
        .put(`/api/users/${uuid}/email-confirmation`)
        .send({ email })
        .expect(403);
    },
  );

  it('requires authentication and CSRF protection', async () => {
    await request(app.getHttpServer())
      .put(`/api/users/${uuid}/email-confirmation`)
      .set('Cookie', agent.cookieHeader)
      .send({ email })
      .expect(403);

    const csrfCookies = agent.cookieHeader
      .split('; ')
      .filter(
        (cookie) =>
          !cookie.startsWith('access_token=') &&
          !cookie.startsWith('refresh_token='),
      )
      .join('; ');

    await request(app.getHttpServer())
      .put(`/api/users/${uuid}/email-confirmation`)
      .set('Cookie', csrfCookies)
      .set(CSRF_HEADER, agent.csrfToken)
      .send({ email })
      .expect(401);
  });

  it('rejects stale addresses, inactive and deleted targets, and invalid input', async () => {
    await agent
      .put(`/api/users/${uuid}/email-confirmation`)
      .send({ email: 'other@example.com' })
      .expect(409);
    await agent
      .put(`/api/users/${uuid}/email-confirmation`)
      .send({})
      .expect(400);
    await agent
      .put(`/api/users/${uuid}/email-confirmation`)
      .send({ email: 'invalid' })
      .expect(400);
    await agent
      .put(`/api/users/${uuid}/status`)
      .send({ status: 'INACTIVE' })
      .expect(200);
    await agent
      .put(`/api/users/${uuid}/email-confirmation`)
      .send({ email })
      .expect(409);
    await agent.delete(`/api/users/${uuid}`).expect(200);
    await agent
      .put(`/api/users/${uuid}/email-confirmation`)
      .send({ email })
      .expect(404);
  });
});
