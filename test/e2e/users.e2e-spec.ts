import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { ABILITY_CATALOG } from '@modules/authorization/domain/catalog/ability-catalog';
import {
  USER_NOTIFIER,
  type UserNotifier,
} from '@modules/users/application/ports/user-notifier.port';
import {
  ADMIN_CREDENTIALS,
  type AuthAgent,
  createAuthAgent,
  CSRF_COOKIE,
  CSRF_HEADER,
  USER_CREDENTIALS,
} from './helpers/auth-agent';
import { createTestApp } from './helpers/create-test-app';
import { deliverQueuedEmails } from './helpers/deliver-queued-emails';

// Exact strings from `src/i18n/{pt-BR,en}/users.json` and `success.json`,
// asserted literally to prove real translation, not a stub.
const PT_BR = {
  userNotFound: 'Usuário não encontrado',
  emailAlreadyInUse: 'Este e-mail já está em uso',
  userInactive: 'Usuário inativo',
  created: 'Criado com sucesso',
  updated: 'Atualizado com sucesso',
  deleted: 'Removido com sucesso',
  ok: 'Operação realizada com sucesso',
  statusActive: 'Ativo',
  // From `src/i18n/pt-BR/errors.json`.
  unauthenticated: 'Autenticação necessária',
  // From `src/i18n/pt-BR/authorization.json`.
  roleNotFound: 'Papel não encontrado',
};

const EN = {
  userNotFound: 'User not found',
  emailAlreadyInUse: 'This email is already in use',
  userInactive: 'User is inactive',
  ok: 'Operation completed successfully',
  statusActive: 'Active',
  roleNotFound: 'Role not found',
};

const STRONG_PASSWORD = 'StrongPass123!';

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
}

interface FlattenedValidationErrorBody {
  statusCode: number;
  error: string;
  message: string[];
}

interface RoleListShape {
  uuid: string;
  role: string;
  roleLabel: string;
}

interface UserListShape {
  uuid: string;
  name: string;
  status: string;
  statusLabel: string;
  roles: RoleListShape[];
}

interface AbilityPairShape {
  action: string;
  subject: string;
}

interface UserDetailShape extends UserListShape {
  email: string;
  emailConfirmedAt: string | null;
  creatorName: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
}

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let agent: AuthAgent;

  beforeEach(async () => {
    app = await createTestApp();

    // Authenticate as ADMIN (full ability catalog) so CRUD is permitted.
    agent = await createAuthAgent(app);
  });

  afterEach(async () => {
    await app.close();
  });

  async function getRoleUuidByName(name: 'ADMIN' | 'USER'): Promise<string> {
    const response = await agent.get('/api/roles').expect(200);

    const body = response.body as EnvelopeBody<RoleListShape[]>;
    const role = body.data.find((candidate) => candidate.role === name);

    if (!role) {
      throw new Error(`Seeded role "${name}" not found — did seeds run?`);
    }

    return role.uuid;
  }

  it('creates a user and returns it enveloped without leaking the password, with emailConfirmedAt null', async () => {
    const userRoleUuid = await getRoleUuidByName('USER');
    const email = `create-${randomUUID()}@example.com`;

    const response = await agent
      .post('/api/users')
      .send({
        name: 'Jane Doe',
        email,
        password: STRONG_PASSWORD,
        roleUuids: [userRoleUuid],
      })
      .expect(201);

    const body = response.body as EnvelopeBody<
      UserDetailShape & { password?: string }
    >;

    expect(body.data.uuid).toEqual(expect.any(String));
    expect(body.data.name).toBe('Jane Doe');
    expect(body.data.email).toBe(email);
    expect(body.data.status).toBe('ACTIVE');
    expect(body.data.roles).toHaveLength(1);
    expect(body.data.roles[0].uuid).toBe(userRoleUuid);
    expect(body.data.emailConfirmedAt).toBeNull();
    expect(body.data).not.toHaveProperty('password');
    expect(body.meta.message).toBe(PT_BR.created);

    await agent.delete(`/api/users/${body.data.uuid}`).expect(200);
  });

  it('performs the read/list/update/delete lifecycle for a created user', async () => {
    const userRoleUuid = await getRoleUuidByName('USER');
    const email = `lifecycle-${randomUUID()}@example.com`;

    const createResponse = await agent
      .post('/api/users')
      .send({
        name: 'Lifecycle User',
        email,
        password: STRONG_PASSWORD,
        roleUuids: [userRoleUuid],
      })
      .expect(201);

    const created = (createResponse.body as EnvelopeBody<UserDetailShape>).data;

    const getResponse = await agent
      .get(`/api/users/${created.uuid}`)
      .expect(200);

    const getBody = getResponse.body as EnvelopeBody<UserDetailShape>;

    expect(getBody.data.email).toBe(email);
    expect(getBody.data.status).toBe('ACTIVE');
    expect(getBody.data.statusLabel).toBe(PT_BR.statusActive);
    expect(getBody.meta.message).toBe(PT_BR.ok);

    const listResponse = await agent
      .get('/api/users')
      .query({ limit: 50 })
      .expect(200);

    const listBody = listResponse.body as EnvelopeBody<UserListShape[]>;

    expect(listBody.meta).toMatchObject({ page: 1, limit: 50 });
    expect(typeof listBody.meta.total).toBe('number');
    expect(listBody.data.some((user) => user.uuid === created.uuid)).toBe(true);
    expect(listBody.meta.message).toBe(PT_BR.ok);

    // `GET /users` returns only summary fields (roles without abilities),
    // never `email` or the detail-only fields of `GET /users/:uuid`.
    const listedCreated = listBody.data.find(
      (user) => user.uuid === created.uuid,
    );

    expect(listedCreated).toMatchObject({
      uuid: created.uuid,
      name: 'Lifecycle User',
      status: 'ACTIVE',
      statusLabel: PT_BR.statusActive,
    });
    expect(listedCreated?.roles).toHaveLength(1);
    expect(listedCreated?.roles[0].uuid).toBe(userRoleUuid);
    expect(listedCreated?.roles[0]).not.toHaveProperty('abilities');
    expect(listedCreated).not.toHaveProperty('email');
    expect(listedCreated).not.toHaveProperty('createdAt');
    expect(listedCreated).not.toHaveProperty('updatedAt');
    expect(listedCreated).not.toHaveProperty('creatorName');
    expect(listedCreated).not.toHaveProperty('updaterName');

    const updatedEmail = `updated-${randomUUID()}@example.com`;

    const patchResponse = await agent
      .patch(`/api/users/${created.uuid}`)
      .send({
        name: 'Lifecycle User Updated',
        email: updatedEmail,
        roleUuids: [userRoleUuid],
      })
      .expect(200);

    const patchBody = patchResponse.body as EnvelopeBody<UserDetailShape>;

    expect(patchBody.data.name).toBe('Lifecycle User Updated');
    expect(patchBody.data.email).toBe(updatedEmail);
    expect(patchBody.meta.message).toBe(PT_BR.updated);

    const deleteResponse = await agent
      .delete(`/api/users/${created.uuid}`)
      .expect(200);

    const deleteBody = deleteResponse.body as EnvelopeBody<null>;

    expect(deleteBody.data).toBeNull();
    expect(deleteBody.meta.message).toBe(PT_BR.deleted);

    const notFoundResponse = await agent
      .get(`/api/users/${created.uuid}`)
      .expect(404);

    const notFoundBody = notFoundResponse.body as ErrorBody;

    expect(notFoundBody).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: PT_BR.userNotFound,
      timestamp: expect.any(String) as string,
      path: `/api/users/${created.uuid}`,
    });
  });

  it('PATCH applies only the provided fields and rejects an explicit null', async () => {
    const userRoleUuid = await getRoleUuidByName('USER');
    const email = `partial-${randomUUID()}@example.com`;

    const createResponse = await agent
      .post('/api/users')
      .send({
        name: 'Partial User',
        email,
        password: STRONG_PASSWORD,
        roleUuids: [userRoleUuid],
      })
      .expect(201);

    const created = (createResponse.body as EnvelopeBody<UserDetailShape>).data;

    const patchResponse = await agent
      .patch(`/api/users/${created.uuid}`)
      .send({ name: 'Partial User Renamed' })
      .expect(200);

    const patched = (patchResponse.body as EnvelopeBody<UserDetailShape>).data;

    expect(patched.name).toBe('Partial User Renamed');
    expect(patched.email).toBe(email);
    expect(patched.roles.map((role) => role.uuid)).toEqual([userRoleUuid]);

    await agent
      .patch(`/api/users/${created.uuid}`)
      .send({ name: null })
      .expect(400);

    await agent.delete(`/api/users/${created.uuid}`).expect(200);
  });

  it('activates and deactivates a user via PUT /users/:uuid/status without soft-deleting it', async () => {
    const userRoleUuid = await getRoleUuidByName('USER');
    const email = `status-${randomUUID()}@example.com`;

    const createResponse = await agent
      .post('/api/users')
      .send({
        name: 'Status User',
        email,
        password: STRONG_PASSWORD,
        roleUuids: [userRoleUuid],
      })
      .expect(201);

    const created = (createResponse.body as EnvelopeBody<UserDetailShape>).data;
    expect(created.status).toBe('ACTIVE');

    const deactivateResponse = await agent
      .put(`/api/users/${created.uuid}/status`)
      .send({ status: 'INACTIVE' })
      .expect(200);

    const deactivateBody =
      deactivateResponse.body as EnvelopeBody<UserDetailShape>;

    expect(deactivateBody.data.status).toBe('INACTIVE');
    expect(deactivateBody.meta.message).toBe(PT_BR.updated);

    // GET is blocked on an INACTIVE record (409), even though PUT /status
    // itself must not soft-delete it, unlike DELETE.
    const getAfterDeactivateResponse = await agent
      .get(`/api/users/${created.uuid}`)
      .expect(409);

    const getAfterDeactivateBody = getAfterDeactivateResponse.body as ErrorBody;

    expect(getAfterDeactivateBody).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: PT_BR.userInactive,
      timestamp: expect.any(String) as string,
      path: `/api/users/${created.uuid}`,
    });

    const reactivateResponse = await agent
      .put(`/api/users/${created.uuid}/status`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    const reactivateBody =
      reactivateResponse.body as EnvelopeBody<UserDetailShape>;

    expect(reactivateBody.data.status).toBe('ACTIVE');

    const getAfterReactivateResponse = await agent
      .get(`/api/users/${created.uuid}`)
      .expect(200);

    expect(
      (getAfterReactivateResponse.body as EnvelopeBody<UserDetailShape>).data
        .status,
    ).toBe('ACTIVE');

    await agent.delete(`/api/users/${created.uuid}`).expect(200);
  });

  it('blocks GET and PATCH with 409 on an INACTIVE user, but DELETE stays exempt', async () => {
    const userRoleUuid = await getRoleUuidByName('USER');
    const email = `inactive-guard-${randomUUID()}@example.com`;

    const createResponse = await agent
      .post('/api/users')
      .send({
        name: 'Inactive Guard User',
        email,
        password: STRONG_PASSWORD,
        roleUuids: [userRoleUuid],
      })
      .expect(201);

    const created = (createResponse.body as EnvelopeBody<UserDetailShape>).data;

    await agent
      .put(`/api/users/${created.uuid}/status`)
      .send({ status: 'INACTIVE' })
      .expect(200);

    const patchResponse = await agent
      .patch(`/api/users/${created.uuid}`)
      .send({
        name: 'Inactive Guard User Updated',
        email,
        roleUuids: [userRoleUuid],
      })
      .expect(409);

    const patchBody = patchResponse.body as ErrorBody;

    expect(patchBody).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: PT_BR.userInactive,
      timestamp: expect.any(String) as string,
      path: `/api/users/${created.uuid}`,
    });

    const getEnResponse = await agent
      .get(`/api/users/${created.uuid}`)
      .set('x-lang', 'en')
      .expect(409);

    const getEnBody = getEnResponse.body as ErrorBody;

    expect(getEnBody.statusCode).toBe(409);
    expect(getEnBody.message).toBe(EN.userInactive);

    // DELETE is exempt from the active-record check: status and soft-delete
    // are independent.
    await agent.delete(`/api/users/${created.uuid}`).expect(200);
  });

  it('localizes statusLabel to English via the x-lang header', async () => {
    const userRoleUuid = await getRoleUuidByName('USER');
    const email = `status-label-${randomUUID()}@example.com`;

    const createResponse = await agent
      .post('/api/users')
      .send({
        name: 'Status Label User',
        email,
        password: STRONG_PASSWORD,
        roleUuids: [userRoleUuid],
      })
      .expect(201);

    const created = (createResponse.body as EnvelopeBody<UserDetailShape>).data;

    expect(created.statusLabel).toBe(PT_BR.statusActive);

    const enResponse = await agent
      .get(`/api/users/${created.uuid}`)
      .set('x-lang', 'en')
      .expect(200);

    const enEnvelope = enResponse.body as EnvelopeBody<UserDetailShape>;
    const enBody = enEnvelope.data;

    expect(enBody.statusLabel).toBe(EN.statusActive);
    expect(enEnvelope.meta.message).toBe(EN.ok);

    await agent.delete(`/api/users/${created.uuid}`).expect(200);
  });

  it('localizes the not-found error to English via the x-lang header', async () => {
    const missingUuid = randomUUID();

    const response = await agent
      .get(`/api/users/${missingUuid}`)
      .set('x-lang', 'en')
      .expect(404);

    const body = response.body as ErrorBody;

    expect(body.statusCode).toBe(404);
    expect(body.message).toBe(EN.userNotFound);
  });

  describe('GET /users/me', () => {
    it("returns the admin's own profile, unshadowed by GET /users/:uuid", async () => {
      const response = await agent.get('/api/users/me').expect(200);

      const body = response.body as EnvelopeBody<UserDetailShape>;

      // This also proves `:uuid` doesn't shadow `/me`: a shadowed route would
      // treat the literal string "me" as a malformed uuid path param and
      // incorrectly respond 400 instead (see the malformed-uuid path-param
      // regression test elsewhere in this file).
      expect(body.data.email).toBe(ADMIN_CREDENTIALS.email);
      expect(body.data.roles.length).toBeGreaterThan(0);
      expect(body.data.roles[0]).not.toHaveProperty('abilities');
      expect(body.data.statusLabel).toBe(PT_BR.statusActive);
      expect(body.meta.message).toBe(PT_BR.ok);
      expect(body.data).not.toHaveProperty('password');
    });

    it('localizes the response to English via the x-lang header', async () => {
      const response = await agent
        .get('/api/users/me')
        .set('x-lang', 'en')
        .expect(200);

      const body = response.body as EnvelopeBody<UserDetailShape>;

      expect(body.data.statusLabel).toBe(EN.statusActive);
      expect(body.meta.message).toBe(EN.ok);
    });

    it('is reachable by a non-admin user, proving it is not gated by directory-read abilities', async () => {
      const userAgent = await createAuthAgent(app, USER_CREDENTIALS);

      const response = await userAgent.get('/api/users/me').expect(200);

      const body = response.body as EnvelopeBody<UserDetailShape>;

      expect(body.data.email).toBe('user@example.com');
    });

    it('rejects an unauthenticated request with a localized 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/users/me')
        .expect(401);

      const body = response.body as ErrorBody;

      expect(body).toEqual({
        statusCode: 401,
        error: 'Unauthorized',
        message: PT_BR.unauthenticated,
        timestamp: expect.any(String) as string,
        path: '/api/users/me',
      });
    });
  });

  describe('GET /users/me/abilities', () => {
    const pairKey = ({ action, subject }: AbilityPairShape): string =>
      `${action}:${subject}`;

    it('returns the full ability catalog for the admin, as bare action/subject pairs', async () => {
      const response = await agent.get('/api/users/me/abilities').expect(200);

      const body = response.body as EnvelopeBody<AbilityPairShape[]>;

      expect(body.data.map(pairKey).sort()).toEqual(
        ABILITY_CATALOG.map(pairKey).sort(),
      );
      expect(Object.keys(body.data[0]).sort()).toEqual(['action', 'subject']);
      expect(body.meta.message).toBe(PT_BR.ok);
    });

    it("returns only the USER role's grant for a non-admin user, without requiring any ability", async () => {
      const userAgent = await createAuthAgent(app, USER_CREDENTIALS);

      const response = await userAgent
        .get('/api/users/me/abilities')
        .expect(200);

      const body = response.body as EnvelopeBody<AbilityPairShape[]>;

      expect(body.data).toEqual([{ action: 'READ', subject: 'USER' }]);
    });

    it('rejects an unauthenticated request with a 401', async () => {
      await request(app.getHttpServer())
        .get('/api/users/me/abilities')
        .expect(401);
    });
  });

  it('filters the list by a case-insensitive partial name match via ?name=', async () => {
    const userRoleUuid = await getRoleUuidByName('USER');
    const suffix = randomUUID();

    const createUser = async (name: string, emailPrefix: string) => {
      const response = await agent
        .post('/api/users')
        .send({
          name,
          email: `${emailPrefix}-${suffix}@example.com`,
          password: STRONG_PASSWORD,
          roleUuids: [userRoleUuid],
        })
        .expect(201);

      return (response.body as EnvelopeBody<UserDetailShape>).data;
    };

    // The filter token embeds the per-test-run `suffix`, so matches are
    // guaranteed scoped to the rows created here — never to unrelated data
    // already present in this (real, shared) database.
    const alice = await createUser(`Ali${suffix}ce`, 'alice');
    const alicia = await createUser(`ali${suffix}cia`, 'alicia');
    const bob = await createUser(`Bob-${suffix}`, 'bob');

    const filteredResponse = await agent
      .get('/api/users')
      .query({ name: `ALI${suffix}`, limit: 50 })
      .expect(200);

    const filteredBody = filteredResponse.body as EnvelopeBody<UserListShape[]>;
    const filteredUuids = filteredBody.data.map((user) => user.uuid).sort();

    expect(filteredUuids).toEqual([alice.uuid, alicia.uuid].sort());
    expect(filteredBody.meta.total).toBe(2);
    expect(filteredBody.data.some((user) => user.uuid === bob.uuid)).toBe(
      false,
    );

    // An empty ?name= behaves the same as omitting the param entirely.
    const emptyNameResponse = await agent
      .get('/api/users')
      .query({ name: '', limit: 50 })
      .expect(200);

    const emptyNameBody = emptyNameResponse.body as EnvelopeBody<
      UserListShape[]
    >;

    const noParamResponse = await agent
      .get('/api/users')
      .query({ limit: 50 })
      .expect(200);

    const noParamBody = noParamResponse.body as EnvelopeBody<UserListShape[]>;

    expect(emptyNameBody.meta.total).toBe(noParamBody.meta.total);
    expect(emptyNameBody.data.some((user) => user.uuid === bob.uuid)).toBe(
      true,
    );

    await agent.delete(`/api/users/${alice.uuid}`).expect(200);
    await agent.delete(`/api/users/${alicia.uuid}`).expect(200);
    await agent.delete(`/api/users/${bob.uuid}`).expect(200);
  });

  it('treats LIKE wildcards in ?name= as literal characters', async () => {
    const userRoleUuid = await getRoleUuidByName('USER');
    const suffix = randomUUID();

    const createUser = async (name: string, emailPrefix: string) => {
      const response = await agent
        .post('/api/users')
        .send({
          name,
          email: `${emailPrefix}-${suffix}@example.com`,
          password: STRONG_PASSWORD,
          roleUuids: [userRoleUuid],
        })
        .expect(201);

      return (response.body as EnvelopeBody<UserDetailShape>).data;
    };

    // Each "decoy" would match its sibling's filter if `%`, `_` or `\` were
    // interpreted as LIKE metacharacters instead of literals.
    const percent = await createUser(`Pct%${suffix}`, 'percent');
    const percentDecoy = await createUser(`Pct-anything-${suffix}`, 'pdecoy');
    const underscore = await createUser(`Und_${suffix}`, 'underscore');
    const underscoreDecoy = await createUser(`Undx${suffix}`, 'udecoy');
    const backslash = await createUser(`Bsl\\${suffix}`, 'backslash');
    const backslashDecoy = await createUser(`Bsl${suffix}`, 'bdecoy');

    const expectNameFilterMatches = async (name: string, uuid: string) => {
      const response = await agent
        .get('/api/users')
        .query({ name, limit: 50 })
        .expect(200);

      const body = response.body as EnvelopeBody<UserListShape[]>;

      expect(body.data.map((user) => user.uuid)).toEqual([uuid]);
    };

    await expectNameFilterMatches(`Pct%${suffix}`, percent.uuid);
    await expectNameFilterMatches(`Und_${suffix}`, underscore.uuid);
    await expectNameFilterMatches(`Bsl\\${suffix}`, backslash.uuid);

    for (const user of [
      percent,
      percentDecoy,
      underscore,
      underscoreDecoy,
      backslash,
      backslashDecoy,
    ]) {
      await agent.delete(`/api/users/${user.uuid}`).expect(200);
    }
  });

  it('filters the list by a case-insensitive partial email match via ?email=', async () => {
    const userRoleUuid = await getRoleUuidByName('USER');
    const suffix = randomUUID();

    // The suffix is placed first (a shared prefix) so that a filter of
    // `${suffix}-ALI` is a genuine substring of both "alice"'s and
    // "alicia"'s email (since "alicia" itself starts with "ali"), while
    // still being unique per test run and staying within the 64-char
    // local-part limit enforced by `@IsEmail()`.
    const createUser = async (name: string, emailSuffix: string) => {
      const response = await agent
        .post('/api/users')
        .send({
          name,
          email: `${suffix}-${emailSuffix}@example.com`,
          password: STRONG_PASSWORD,
          roleUuids: [userRoleUuid],
        })
        .expect(201);

      return (response.body as EnvelopeBody<UserDetailShape>).data;
    };

    const alice = await createUser('Email Alice', 'ali');
    const alicia = await createUser('Email Alicia', 'alicia');
    const bob = await createUser('Email Bob', 'bob');

    const filteredResponse = await agent
      .get('/api/users')
      .query({ email: `${suffix}-ALI`, limit: 50 })
      .expect(200);

    const filteredBody = filteredResponse.body as EnvelopeBody<UserListShape[]>;
    const filteredUuids = filteredBody.data.map((user) => user.uuid).sort();

    expect(filteredUuids).toEqual([alice.uuid, alicia.uuid].sort());
    expect(filteredBody.data.some((user) => user.uuid === bob.uuid)).toBe(
      false,
    );

    await agent.delete(`/api/users/${alice.uuid}`).expect(200);
    await agent.delete(`/api/users/${alicia.uuid}`).expect(200);
    await agent.delete(`/api/users/${bob.uuid}`).expect(200);
  });

  it('filters the list by an exact status match via ?status=', async () => {
    const userRoleUuid = await getRoleUuidByName('USER');
    const email = `status-filter-${randomUUID()}@example.com`;

    const createResponse = await agent
      .post('/api/users')
      .send({
        name: 'Status Filter User',
        email,
        password: STRONG_PASSWORD,
        roleUuids: [userRoleUuid],
      })
      .expect(201);

    const created = (createResponse.body as EnvelopeBody<UserDetailShape>).data;

    await agent
      .put(`/api/users/${created.uuid}/status`)
      .send({ status: 'INACTIVE' })
      .expect(200);

    const inactiveResponse = await agent
      .get('/api/users')
      .query({ status: 'INACTIVE', limit: 50 })
      .expect(200);

    const inactiveBody = inactiveResponse.body as EnvelopeBody<UserListShape[]>;

    expect(inactiveBody.data.some((user) => user.uuid === created.uuid)).toBe(
      true,
    );
    expect(inactiveBody.data.every((user) => user.status === 'INACTIVE')).toBe(
      true,
    );

    const activeResponse = await agent
      .get('/api/users')
      .query({ status: 'ACTIVE', limit: 50 })
      .expect(200);

    const activeBody = activeResponse.body as EnvelopeBody<UserListShape[]>;

    expect(activeBody.data.some((user) => user.uuid === created.uuid)).toBe(
      false,
    );

    // Cleanup: reactivate so DELETE (soft-delete) leaves a consistent trail.
    await agent
      .put(`/api/users/${created.uuid}/status`)
      .send({ status: 'ACTIVE' })
      .expect(200);
    await agent.delete(`/api/users/${created.uuid}`).expect(200);
  });

  it('defaults the list to ACTIVE users when ?status= is omitted', async () => {
    const userRoleUuid = await getRoleUuidByName('USER');
    const suffix = randomUUID();

    const createUser = async (name: string, emailPrefix: string) => {
      const response = await agent
        .post('/api/users')
        .send({
          name,
          email: `${emailPrefix}-${suffix}@example.com`,
          password: STRONG_PASSWORD,
          roleUuids: [userRoleUuid],
        })
        .expect(201);

      return (response.body as EnvelopeBody<UserDetailShape>).data;
    };

    const activeUser = await createUser(
      `DefaultStatus${suffix}Active`,
      'default-status-active',
    );

    const inactiveUser = await createUser(
      `DefaultStatus${suffix}Inactive`,
      'default-status-inactive',
    );

    await agent
      .put(`/api/users/${inactiveUser.uuid}/status`)
      .send({ status: 'INACTIVE' })
      .expect(200);

    const noParamResponse = await agent
      .get('/api/users')
      .query({ name: `DefaultStatus${suffix}`, limit: 50 })
      .expect(200);

    const noParamBody = noParamResponse.body as EnvelopeBody<UserListShape[]>;
    const noParamUuids = noParamBody.data.map((user) => user.uuid);

    expect(noParamUuids).toContain(activeUser.uuid);
    expect(noParamUuids).not.toContain(inactiveUser.uuid);

    const explicitInactiveResponse = await agent
      .get('/api/users')
      .query({ name: `DefaultStatus${suffix}`, status: 'INACTIVE', limit: 50 })
      .expect(200);

    const explicitInactiveBody = explicitInactiveResponse.body as EnvelopeBody<
      UserListShape[]
    >;

    const explicitInactiveUuids = explicitInactiveBody.data.map(
      (user) => user.uuid,
    );

    expect(explicitInactiveUuids).toContain(inactiveUser.uuid);
    expect(explicitInactiveUuids).not.toContain(activeUser.uuid);

    // Cleanup: reactivate so DELETE (soft-delete) leaves a consistent trail,
    // then remove both straggler users.
    await agent
      .put(`/api/users/${inactiveUser.uuid}/status`)
      .send({ status: 'ACTIVE' })
      .expect(200);
    await agent.delete(`/api/users/${activeUser.uuid}`).expect(200);
    await agent.delete(`/api/users/${inactiveUser.uuid}`).expect(200);
  });

  it('filters the list by role uuid via ?role=', async () => {
    const adminRoleUuid = await getRoleUuidByName('ADMIN');
    const userRoleUuid = await getRoleUuidByName('USER');
    const email = `role-filter-${randomUUID()}@example.com`;

    const createResponse = await agent
      .post('/api/users')
      .send({
        name: 'Role Filter User',
        email,
        password: STRONG_PASSWORD,
        roleUuids: [adminRoleUuid],
      })
      .expect(201);

    const created = (createResponse.body as EnvelopeBody<UserDetailShape>).data;

    const adminResponse = await agent
      .get('/api/users')
      .query({ role: adminRoleUuid, limit: 50 })
      .expect(200);

    const adminBody = adminResponse.body as EnvelopeBody<UserListShape[]>;

    expect(adminBody.data.some((user) => user.uuid === created.uuid)).toBe(
      true,
    );

    const userRoleResponse = await agent
      .get('/api/users')
      .query({ role: userRoleUuid, limit: 50 })
      .expect(200);

    const userRoleBody = userRoleResponse.body as EnvelopeBody<UserListShape[]>;

    expect(userRoleBody.data.some((user) => user.uuid === created.uuid)).toBe(
      false,
    );

    await agent.delete(`/api/users/${created.uuid}`).expect(200);
  });

  it('combines multiple filters (name + status + role) with AND semantics', async () => {
    const userRoleUuid = await getRoleUuidByName('USER');
    const suffix = randomUUID();

    const createUser = async (name: string, emailPrefix: string) => {
      const response = await agent
        .post('/api/users')
        .send({
          name,
          email: `${emailPrefix}-${suffix}@example.com`,
          password: STRONG_PASSWORD,
          roleUuids: [userRoleUuid],
        })
        .expect(201);

      return (response.body as EnvelopeBody<UserDetailShape>).data;
    };

    const match = await createUser(`Combo${suffix}Match`, 'combo-match');
    const wrongName = await createUser('Other Name', 'combo-other');

    const combinedResponse = await agent
      .get('/api/users')
      .query({
        name: `Combo${suffix}`,
        status: 'ACTIVE',
        role: userRoleUuid,
        limit: 50,
      })
      .expect(200);

    const combinedBody = combinedResponse.body as EnvelopeBody<UserListShape[]>;
    const combinedUuids = combinedBody.data.map((user) => user.uuid);

    expect(combinedUuids).toContain(match.uuid);
    expect(combinedUuids).not.toContain(wrongName.uuid);

    await agent.delete(`/api/users/${match.uuid}`).expect(200);
    await agent.delete(`/api/users/${wrongName.uuid}`).expect(200);
  });

  it('rejects an invalid ?status= value with a translated validation message', async () => {
    const ptResponse = await agent
      .get('/api/users')
      .query({ status: 'BOGUS' })
      .expect(400);

    const ptBody = ptResponse.body as FlattenedValidationErrorBody;

    expect(ptBody.statusCode).toBe(400);
    expect(ptBody.message).toEqual(['O campo status possui um valor inválido']);

    const enResponse = await agent
      .get('/api/users')
      .set('x-lang', 'en')
      .query({ status: 'BOGUS' })
      .expect(400);

    const enBody = enResponse.body as FlattenedValidationErrorBody;

    expect(enBody.message).toEqual(['The status field has an invalid value']);
  });

  it('rejects a non-numeric ?limit= with only the integer message', async () => {
    const response = await agent
      .get('/api/users')
      .set('x-lang', 'en')
      .query({ limit: 'abc' })
      .expect(400);

    const body = response.body as FlattenedValidationErrorBody;

    expect(body.message).toEqual(['The limit field must be an integer']);
  });

  it('rejects an invalid ?role= value with a translated validation message', async () => {
    const ptResponse = await agent
      .get('/api/users')
      .query({ role: 'not-a-uuid' })
      .expect(400);

    const ptBody = ptResponse.body as FlattenedValidationErrorBody;

    expect(ptBody.statusCode).toBe(400);
    expect(ptBody.message).toEqual(['O campo role deve ser um UUID válido']);

    const enResponse = await agent
      .get('/api/users')
      .set('x-lang', 'en')
      .query({ role: 'not-a-uuid' })
      .expect(400);

    const enBody = enResponse.body as FlattenedValidationErrorBody;

    expect(enBody.message).toEqual(['The role field must be a valid UUID']);
  });

  // Oversized input must be rejected by validation with a translated 400,
  // never reach the varchar(150) column and surface as a 500.
  it('rejects an oversized, empty, or whitespace-only name and an oversized password on POST /users with a translated 400', async () => {
    const userRoleUuid = await getRoleUuidByName('USER');

    const ptResponse = await agent
      .post('/api/users')
      .send({
        name: 'n'.repeat(151),
        email: `oversized-${randomUUID()}@example.com`,
        password: 'Aa1!'.padEnd(129, 'p'),
        roleUuids: [userRoleUuid],
      })
      .expect(400);

    const ptBody = ptResponse.body as FlattenedValidationErrorBody;

    expect(ptBody.message).toEqual([
      'O campo name deve ter no máximo 150 caracteres',
      'O campo password deve ter no máximo 128 caracteres',
    ]);

    const enResponse = await agent
      .post('/api/users')
      .set('x-lang', 'en')
      .send({
        name: '',
        email: `empty-name-${randomUUID()}@example.com`,
        password: STRONG_PASSWORD,
        roleUuids: [userRoleUuid],
      })
      .expect(400);

    const enBody = enResponse.body as FlattenedValidationErrorBody;

    expect(enBody.message).toEqual(['The name field must not be empty']);

    const blankResponse = await agent
      .post('/api/users')
      .set('x-lang', 'en')
      .send({
        name: '   ',
        email: `blank-name-${randomUUID()}@example.com`,
        password: STRONG_PASSWORD,
        roleUuids: [userRoleUuid],
      })
      .expect(400);

    const blankBody = blankResponse.body as FlattenedValidationErrorBody;

    expect(blankBody.message).toEqual(['The name field must not be empty']);
  });

  it('rejects a weak password on POST /users with a translated 400', async () => {
    const userRoleUuid = await getRoleUuidByName('USER');

    const payload = {
      name: 'Weak Password',
      email: `weak-password-${randomUUID()}@example.com`,
      password: 'weakpassword1',
      roleUuids: [userRoleUuid],
    };

    const ptResponse = await agent.post('/api/users').send(payload).expect(400);

    expect((ptResponse.body as FlattenedValidationErrorBody).message).toEqual([
      'O campo password deve conter uma letra maiúscula, uma letra minúscula, um número e um símbolo',
    ]);

    const enResponse = await agent
      .post('/api/users')
      .set('x-lang', 'en')
      .send(payload)
      .expect(400);

    expect((enResponse.body as FlattenedValidationErrorBody).message).toEqual([
      'The password field must contain an uppercase letter, a lowercase letter, a number, and a symbol',
    ]);
  });

  // A malformed `:uuid` path param must be rejected with a translated 400
  // before reaching the repository, not surface as a 500 from TypeORM.
  it('rejects a malformed :uuid path param with a translated 400 instead of a 500, on GET/DELETE/PUT status', async () => {
    const malformedUuid = 'not-a-uuid';

    const ptGetResponse = await agent
      .get(`/api/users/${malformedUuid}`)
      .expect(400);

    const ptGetBody = ptGetResponse.body as ErrorBody;

    expect(ptGetBody).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'O campo uuid deve ser um UUID válido',
      timestamp: expect.any(String) as string,
      path: `/api/users/${malformedUuid}`,
    });

    const enGetResponse = await agent
      .get(`/api/users/${malformedUuid}`)
      .set('x-lang', 'en')
      .expect(400);

    const enGetBody = enGetResponse.body as ErrorBody;

    expect(enGetBody.message).toBe('The uuid field must be a valid UUID');

    const deleteResponse = await agent
      .delete(`/api/users/${malformedUuid}`)
      .expect(400);

    const deleteBody = deleteResponse.body as ErrorBody;

    expect(deleteBody).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'O campo uuid deve ser um UUID válido',
      timestamp: expect.any(String) as string,
      path: `/api/users/${malformedUuid}`,
    });

    const statusResponse = await agent
      .put(`/api/users/${malformedUuid}/status`)
      .send({ status: 'ACTIVE' })
      .expect(400);

    const statusBody = statusResponse.body as ErrorBody;

    expect(statusBody).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'O campo uuid deve ser um UUID válido',
      timestamp: expect.any(String) as string,
      path: `/api/users/${malformedUuid}/status`,
    });
  });

  it('rejects creating a user with an email already in use, localized pt-BR by default and en via x-lang', async () => {
    const userRoleUuid = await getRoleUuidByName('USER');

    const ptResponse = await agent
      .post('/api/users')
      .send({
        name: 'Duplicate Email',
        email: 'user@example.com',
        password: STRONG_PASSWORD,
        roleUuids: [userRoleUuid],
      })
      .expect(409);

    const ptBody = ptResponse.body as ErrorBody;

    expect(ptBody.statusCode).toBe(409);
    expect(ptBody.message).toBe(PT_BR.emailAlreadyInUse);

    const enResponse = await agent
      .post('/api/users')
      .set('x-lang', 'en')
      .send({
        name: 'Duplicate Email',
        email: 'user@example.com',
        password: STRONG_PASSWORD,
        roleUuids: [userRoleUuid],
      })
      .expect(409);

    const enBody = enResponse.body as ErrorBody;

    expect(enBody.message).toBe(EN.emailAlreadyInUse);
  });

  it('rejects an unknown role uuid on POST and PATCH with a localized 404 instead of dropping it', async () => {
    const userRoleUuid = await getRoleUuidByName('USER');
    const unknownRoleUuid = randomUUID();
    const email = `unknown-role-${randomUUID()}@example.com`;

    const createResponse = await agent
      .post('/api/users')
      .send({
        name: 'Unknown Role',
        email,
        password: STRONG_PASSWORD,
        roleUuids: [userRoleUuid, unknownRoleUuid],
      })
      .expect(404);

    expect((createResponse.body as ErrorBody).message).toBe(PT_BR.roleNotFound);

    const created = await agent
      .post('/api/users')
      .send({
        name: 'Unknown Role',
        email,
        password: STRONG_PASSWORD,
        roleUuids: [userRoleUuid],
      })
      .expect(201);

    const { uuid } = (created.body as EnvelopeBody<UserDetailShape>).data;

    const updateResponse = await agent
      .patch(`/api/users/${uuid}`)
      .set('x-lang', 'en')
      .send({ name: 'Unknown Role', email, roleUuids: [unknownRoleUuid] })
      .expect(404);

    expect((updateResponse.body as ErrorBody).message).toBe(EN.roleNotFound);

    const fetched = await agent.get(`/api/users/${uuid}`).expect(200);
    const roles = (fetched.body as EnvelopeBody<UserDetailShape>).data.roles;

    expect(roles.map((role) => role.uuid)).toEqual([userRoleUuid]);
  });

  describe('creatorName/updaterName', () => {
    it('resolves creatorName/updaterName to the acting admin right after creation, and surfaces the new user in the (lean) list without creatorName', async () => {
      const userRoleUuid = await getRoleUuidByName('USER');
      const email = `creator-name-${randomUUID()}@example.com`;

      const createResponse = await agent
        .post('/api/users')
        .send({
          name: 'Creator Name User',
          email,
          password: STRONG_PASSWORD,
          roleUuids: [userRoleUuid],
        })
        .expect(201);

      const created = (createResponse.body as EnvelopeBody<UserDetailShape>)
        .data;

      expect(created.creatorName).toBe('Admin');
      expect(created.updaterName).toBe('Admin');

      const getResponse = await agent
        .get(`/api/users/${created.uuid}`)
        .expect(200);

      const getBody = (getResponse.body as EnvelopeBody<UserDetailShape>).data;

      expect(getBody.creatorName).toBe('Admin');
      expect(getBody.updaterName).toBe('Admin');

      const listResponse = await agent
        .get('/api/users')
        .query({ limit: 50 })
        .expect(200);

      const listBody = listResponse.body as EnvelopeBody<UserListShape[]>;
      const listed = listBody.data.find((user) => user.uuid === created.uuid);

      expect(listed).toBeDefined();
      expect(listed).not.toHaveProperty('creatorName');
      expect(listed).not.toHaveProperty('updaterName');

      await agent.delete(`/api/users/${created.uuid}`).expect(200);
    });

    it("the seeded admin's own user record has null creatorName/updaterName (no authorship for bootstrap seed data)", async () => {
      const adminUuid = (await agent.get('/api/users/me').expect(200))
        .body as EnvelopeBody<UserDetailShape>;

      const response = await agent
        .get(`/api/users/${adminUuid.data.uuid}`)
        .expect(200);

      const body = (response.body as EnvelopeBody<UserDetailShape>).data;

      expect(body.creatorName).toBeNull();
      expect(body.updaterName).toBeNull();
    });

    it('PATCH updates updaterName to the acting admin, exercising the update-then-read path', async () => {
      const userRoleUuid = await getRoleUuidByName('USER');
      const email = `updater-name-${randomUUID()}@example.com`;

      const createResponse = await agent
        .post('/api/users')
        .send({
          name: 'Updater Name User',
          email,
          password: STRONG_PASSWORD,
          roleUuids: [userRoleUuid],
        })
        .expect(201);

      const created = (createResponse.body as EnvelopeBody<UserDetailShape>)
        .data;

      await agent
        .patch(`/api/users/${created.uuid}`)
        .send({
          name: 'Updater Name User Updated',
          email,
          roleUuids: [userRoleUuid],
        })
        .expect(200);

      const getResponse = await agent
        .get(`/api/users/${created.uuid}`)
        .expect(200);

      const getBody = (getResponse.body as EnvelopeBody<UserDetailShape>).data;

      expect(getBody.updaterName).toBe('Admin');
      expect(getBody.creatorName).toBe('Admin');

      await agent.delete(`/api/users/${created.uuid}`).expect(200);
    });

    it('GET /users/me carries creatorName/updaterName fields (null for the seeded admin caller)', async () => {
      const response = await agent.get('/api/users/me').expect(200);

      const body = (response.body as EnvelopeBody<UserDetailShape>).data;

      expect(body).toHaveProperty('creatorName');
      expect(body).toHaveProperty('updaterName');
      expect(body.creatorName).toBeNull();
      expect(body.updaterName).toBeNull();
    });

    it('never leaks a password key anywhere in the response body', async () => {
      const userRoleUuid = await getRoleUuidByName('USER');
      const email = `no-secret-leak-${randomUUID()}@example.com`;

      const createResponse = await agent
        .post('/api/users')
        .send({
          name: 'No Secret Leak User',
          email,
          password: STRONG_PASSWORD,
          roleUuids: [userRoleUuid],
        })
        .expect(201);

      const created = (createResponse.body as EnvelopeBody<UserDetailShape>)
        .data;

      const getResponse = await agent
        .get(`/api/users/${created.uuid}`)
        .expect(200);

      const meResponse = await agent.get('/api/users/me').expect(200);

      const listResponse = await agent
        .get('/api/users')
        .query({ limit: 50 })
        .expect(200);

      const bodies = [
        createResponse.body,
        getResponse.body,
        meResponse.body,
        listResponse.body,
      ];

      for (const body of bodies) {
        expect(JSON.stringify(body)).not.toMatch(/"password"/);
      }

      await agent.delete(`/api/users/${created.uuid}`).expect(200);
    });
  });
});

// Overrides `USER_NOTIFIER` with a capturing double so the test can read the
// confirmation token that would otherwise only be logged.
describe('Users (e2e) — email confirmation flow', () => {
  let app: INestApplication<App>;
  let adminAgent: AuthAgent;

  const capturedTokens = new Map<string, string>();

  const sendEmailConfirmation = jest.fn(
    (input: { email: string; name: string; token: string }): Promise<void> => {
      capturedTokens.set(input.email, input.token);
      return Promise.resolve();
    },
  );

  const capturingNotifier: UserNotifier = {
    sendEmailConfirmation,
    sendPasswordReset: () => Promise.resolve(),
    sendUserChangeRequest: () => Promise.resolve(),
    sendEmailChangeNotice: () => Promise.resolve(),
  };

  const PT_BR_CONFIRM = {
    emailNotConfirmed: 'Confirme seu e-mail para acessar sua conta',
    emailConfirmed: 'E-mail confirmado com sucesso',
    invalidConfirmationToken: 'Token de confirmação inválido ou expirado',
  };

  const EN_CONFIRM = {
    emailNotConfirmed: 'Confirm your email to access your account',
  };

  interface EnvelopeBodyLocal<T> {
    data: T;
    meta: Record<string, unknown>;
  }

  interface ErrorBodyLocal {
    statusCode: number;
    error: string;
    message: string;
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

  function cookieHeaderFrom(response: request.Response): string {
    return extractSetCookies(response)
      .map((entry) => entry.split(';')[0])
      .join('; ');
  }

  function cookieValue(response: request.Response, name: string): string {
    const entry = extractSetCookies(response).find((cookie) =>
      cookie.startsWith(`${name}=`),
    );

    const value = entry?.split(';')[0].slice(name.length + 1);

    if (value === undefined) {
      throw new Error(`Expected a "${name}" cookie in the response`);
    }

    return value;
  }

  async function getCsrf(): Promise<{ cookieHeader: string; token: string }> {
    const response = await request(app.getHttpServer())
      .get('/api/auth/csrf')
      .expect(200);

    return {
      cookieHeader: cookieHeaderFrom(response),
      token: cookieValue(response, CSRF_COOKIE),
    };
  }

  beforeEach(async () => {
    capturedTokens.clear();
    sendEmailConfirmation.mockClear();

    app = await createTestApp({
      override: (builder) =>
        builder.overrideProvider(USER_NOTIFIER).useValue(capturingNotifier),
    });

    adminAgent = await createAuthAgent(app);
  });

  afterEach(async () => {
    await app.close();
  });

  async function getUserRoleUuid(): Promise<string> {
    interface RoleShape {
      uuid: string;
      role: string;
    }

    const response = await adminAgent.get('/api/roles').expect(200);
    const body = response.body as EnvelopeBodyLocal<RoleShape[]>;
    const role = body.data.find((candidate) => candidate.role === 'USER');

    if (!role) {
      throw new Error('Seeded USER role not found — did seeds run?');
    }

    return role.uuid;
  }

  it('runs the full confirm-email lifecycle: unconfirmed login is rejected, confirming unlocks login, and the token is single-use', async () => {
    const userRoleUuid = await getUserRoleUuid();
    const email = `confirm-flow-${randomUUID()}@example.com`;
    const password = 'StrongPass123!';

    const createResponse = await adminAgent
      .post('/api/users')
      .send({
        name: 'Confirm Flow User',
        email,
        password,
        roleUuids: [userRoleUuid],
      })
      .expect(201);

    const created = (
      createResponse.body as EnvelopeBodyLocal<{
        uuid: string;
        emailConfirmedAt: string | null;
      }>
    ).data;

    expect(created.emailConfirmedAt).toBeNull();
    await expect(deliverQueuedEmails(app, email)).resolves.toBe(1);
    expect(sendEmailConfirmation).toHaveBeenCalledTimes(1);

    const token = capturedTokens.get(email);
    expect(token).toBeDefined();

    // Unconfirmed login attempt is rejected with a localized 403 — pt-BR by
    // default, en via x-lang.
    const ptCsrf = await getCsrf();

    const ptLoginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', ptCsrf.cookieHeader)
      .set(CSRF_HEADER, ptCsrf.token)
      .send({ email, password })
      .expect(403);

    expect((ptLoginResponse.body as ErrorBodyLocal).message).toBe(
      PT_BR_CONFIRM.emailNotConfirmed,
    );

    const enCsrf = await getCsrf();

    const enLoginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', enCsrf.cookieHeader)
      .set(CSRF_HEADER, enCsrf.token)
      .set('x-lang', 'en')
      .send({ email, password })
      .expect(403);

    expect((enLoginResponse.body as ErrorBodyLocal).message).toBe(
      EN_CONFIRM.emailNotConfirmed,
    );

    const confirmResponse = await adminAgent
      .post('/api/users/confirm-email')
      .send({ token })
      .expect(200);

    expect((confirmResponse.body as EnvelopeBodyLocal<null>).meta.message).toBe(
      PT_BR_CONFIRM.emailConfirmed,
    );

    const finalCsrf = await getCsrf();

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', finalCsrf.cookieHeader)
      .set(CSRF_HEADER, finalCsrf.token)
      .send({ email, password })
      .expect(200);

    // Replaying the same (now-consumed) token fails.
    const replayResponse = await adminAgent
      .post('/api/users/confirm-email')
      .send({ token })
      .expect(422);

    expect((replayResponse.body as ErrorBodyLocal).message).toBe(
      PT_BR_CONFIRM.invalidConfirmationToken,
    );

    // A garbage token also fails, with the same generic error.
    const garbageResponse = await adminAgent
      .post('/api/users/confirm-email')
      .send({ token: 'not-a-real-token' })
      .expect(422);

    expect((garbageResponse.body as ErrorBodyLocal).message).toBe(
      PT_BR_CONFIRM.invalidConfirmationToken,
    );

    await adminAgent.delete(`/api/users/${created.uuid}`).expect(200);
  });

  it('answers 403 email-not-confirmed, not 401, on protected routes for a signed-in user whose email was changed', async () => {
    const userRoleUuid = await getUserRoleUuid();
    const email = `unconfirmed-session-${randomUUID()}@example.com`;
    const password = 'StrongPass123!';

    const createResponse = await adminAgent
      .post('/api/users')
      .send({
        name: 'Unconfirmed Session User',
        email,
        password,
        roleUuids: [userRoleUuid],
      })
      .expect(201);

    const created = (createResponse.body as EnvelopeBodyLocal<{ uuid: string }>)
      .data;

    await deliverQueuedEmails(app, email);
    await adminAgent
      .post('/api/users/confirm-email')
      .send({ token: capturedTokens.get(email) })
      .expect(200);

    const csrf = await getCsrf();

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', csrf.cookieHeader)
      .set(CSRF_HEADER, csrf.token)
      .send({ email, password })
      .expect(200);

    const sessionCookies = cookieHeaderFrom(loginResponse);

    await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Cookie', sessionCookies)
      .expect(200);

    await adminAgent
      .patch(`/api/users/${created.uuid}`)
      .send({ email: `unconfirmed-session-new-${randomUUID()}@example.com` })
      .expect(200);

    const meResponse = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Cookie', sessionCookies)
      .expect(403);

    expect((meResponse.body as ErrorBodyLocal).message).toBe(
      PT_BR_CONFIRM.emailNotConfirmed,
    );

    await adminAgent.delete(`/api/users/${created.uuid}`).expect(200);
  });

  it('ends every session on deactivation, so refresh and access cookies issued before it stay dead after reactivation', async () => {
    const userRoleUuid = await getUserRoleUuid();
    const email = `deactivated-session-${randomUUID()}@example.com`;
    const password = 'StrongPass123!';

    const createResponse = await adminAgent
      .post('/api/users')
      .send({
        name: 'Deactivated Session User',
        email,
        password,
        roleUuids: [userRoleUuid],
      })
      .expect(201);

    const { uuid } = (
      createResponse.body as EnvelopeBodyLocal<{ uuid: string }>
    ).data;

    await deliverQueuedEmails(app, email);
    await adminAgent
      .post('/api/users/confirm-email')
      .send({ token: capturedTokens.get(email) })
      .expect(200);

    async function login(): Promise<request.Response> {
      const csrf = await getCsrf();

      return request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Cookie', csrf.cookieHeader)
        .set(CSRF_HEADER, csrf.token)
        .send({ email, password })
        .expect(200);
    }

    function refresh(session: request.Response): request.Test {
      return request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookieHeaderFrom(session))
        .set(CSRF_HEADER, cookieValue(session, CSRF_COOKIE));
    }

    function getMe(session: request.Response): request.Test {
      return request(app.getHttpServer())
        .get('/api/users/me')
        .set('Cookie', cookieHeaderFrom(session));
    }

    const staleSession = await login();

    await getMe(staleSession).expect(200);

    await adminAgent
      .put(`/api/users/${uuid}/status`)
      .send({ status: 'INACTIVE' })
      .expect(200);

    await getMe(staleSession).expect(401);

    await adminAgent
      .put(`/api/users/${uuid}/status`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    await getMe(staleSession).expect(401);
    await refresh(staleSession).expect(401);

    // Only sessions started before the deactivation are revoked.
    await refresh(await login()).expect(200);

    await adminAgent.delete(`/api/users/${uuid}`).expect(200);
  });

  it('ends every session on deletion: access and refresh cookies issued before it are rejected immediately', async () => {
    const userRoleUuid = await getUserRoleUuid();
    const email = `deleted-session-${randomUUID()}@example.com`;
    const password = 'StrongPass123!';

    const createResponse = await adminAgent
      .post('/api/users')
      .send({
        name: 'Deleted Session User',
        email,
        password,
        roleUuids: [userRoleUuid],
      })
      .expect(201);

    const { uuid } = (
      createResponse.body as EnvelopeBodyLocal<{ uuid: string }>
    ).data;

    await deliverQueuedEmails(app, email);
    await adminAgent
      .post('/api/users/confirm-email')
      .send({ token: capturedTokens.get(email) })
      .expect(200);

    const csrf = await getCsrf();

    const session = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', csrf.cookieHeader)
      .set(CSRF_HEADER, csrf.token)
      .send({ email, password })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Cookie', cookieHeaderFrom(session))
      .expect(200);

    await adminAgent.delete(`/api/users/${uuid}`).expect(200);

    await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Cookie', cookieHeaderFrom(session))
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeaderFrom(session))
      .set(CSRF_HEADER, cookieValue(session, CSRF_COOKIE))
      .expect(401);
  });

  it('treats emails case- and whitespace-insensitively: stores a padded mixed-case registration normalized, rejects a differently-cased duplicate, and logs in with any casing or padding', async () => {
    const userRoleUuid = await getUserRoleUuid();
    const localPart = `Mixed-Case-${randomUUID()}`;
    const mixedCaseEmail = `${localPart}@Example.COM`;
    const normalizedEmail = mixedCaseEmail.toLowerCase();
    const password = 'StrongPass123!';

    const createResponse = await adminAgent
      .post('/api/users')
      .send({
        name: 'Mixed Case User',
        email: `  ${mixedCaseEmail} `,
        password,
        roleUuids: [userRoleUuid],
      })
      .expect(201);

    const created = (
      createResponse.body as EnvelopeBodyLocal<{ uuid: string; email: string }>
    ).data;

    expect(created.email).toBe(normalizedEmail);

    await adminAgent
      .post('/api/users')
      .send({
        name: 'Mixed Case Duplicate',
        email: normalizedEmail.toUpperCase(),
        password,
        roleUuids: [userRoleUuid],
      })
      .expect(409);

    await deliverQueuedEmails(app, normalizedEmail);

    await adminAgent
      .post('/api/users/confirm-email')
      .send({ token: capturedTokens.get(normalizedEmail) })
      .expect(200);

    for (const loginEmail of [
      mixedCaseEmail,
      normalizedEmail.toUpperCase(),
      ` ${mixedCaseEmail}  `,
    ]) {
      const csrf = await getCsrf();

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Cookie', csrf.cookieHeader)
        .set(CSRF_HEADER, csrf.token)
        .send({ email: loginEmail, password })
        .expect(200);
    }

    await adminAgent.delete(`/api/users/${created.uuid}`).expect(200);
  });

  it('PATCH changing the email re-unconfirms and issues a new token; a name-only PATCH does neither', async () => {
    const userRoleUuid = await getUserRoleUuid();
    const email = `patch-flow-${randomUUID()}@example.com`;
    const password = 'StrongPass123!';

    const createResponse = await adminAgent
      .post('/api/users')
      .send({
        name: 'Patch Flow User',
        email,
        password,
        roleUuids: [userRoleUuid],
      })
      .expect(201);

    const created = (createResponse.body as EnvelopeBodyLocal<{ uuid: string }>)
      .data;

    await deliverQueuedEmails(app, email);

    const originalToken = capturedTokens.get(email);
    expect(originalToken).toBeDefined();

    // Confirm the original email first.
    await adminAgent
      .post('/api/users/confirm-email')
      .send({ token: originalToken })
      .expect(200);

    sendEmailConfirmation.mockClear();

    // A name-only PATCH (email unchanged) issues no new token and leaves the
    // account confirmed.
    const nameOnlyPatchResponse = await adminAgent
      .patch(`/api/users/${created.uuid}`)
      .send({
        name: 'Patch Flow User Renamed',
        email,
        roleUuids: [userRoleUuid],
      })
      .expect(200);

    const nameOnlyBody = (
      nameOnlyPatchResponse.body as EnvelopeBodyLocal<{
        emailConfirmedAt: string | null;
      }>
    ).data;

    expect(nameOnlyBody.emailConfirmedAt).not.toBeNull();
    await expect(deliverQueuedEmails(app, email)).resolves.toBe(0);
    expect(sendEmailConfirmation).not.toHaveBeenCalled();

    // Changing the email re-unconfirms the account and issues exactly one new
    // token.
    const newEmail = `patch-flow-updated-${randomUUID()}@example.com`;

    const emailChangePatchResponse = await adminAgent
      .patch(`/api/users/${created.uuid}`)
      .send({
        name: 'Patch Flow User Renamed',
        email: newEmail,
        roleUuids: [userRoleUuid],
      })
      .expect(200);

    const emailChangeBody = (
      emailChangePatchResponse.body as EnvelopeBodyLocal<{
        emailConfirmedAt: string | null;
      }>
    ).data;

    expect(emailChangeBody.emailConfirmedAt).toBeNull();
    await expect(deliverQueuedEmails(app, newEmail)).resolves.toBe(1);
    expect(sendEmailConfirmation).toHaveBeenCalledTimes(1);
    expect(capturedTokens.has(newEmail)).toBe(true);

    await adminAgent.delete(`/api/users/${created.uuid}`).expect(200);
  });

  it('never leaks a raw token or hash anywhere in the confirm-email response bodies', async () => {
    const userRoleUuid = await getUserRoleUuid();
    const email = `no-token-leak-${randomUUID()}@example.com`;
    const password = 'StrongPass123!';

    const createResponse = await adminAgent
      .post('/api/users')
      .send({
        name: 'No Token Leak User',
        email,
        password,
        roleUuids: [userRoleUuid],
      })
      .expect(201);

    const created = (createResponse.body as EnvelopeBodyLocal<{ uuid: string }>)
      .data;

    await deliverQueuedEmails(app, email);

    const token = capturedTokens.get(email);
    expect(token).toBeDefined();

    const confirmResponse = await adminAgent
      .post('/api/users/confirm-email')
      .send({ token })
      .expect(200);

    expect(JSON.stringify(createResponse.body)).not.toContain(token);
    expect(JSON.stringify(confirmResponse.body)).not.toContain(token);

    await adminAgent.delete(`/api/users/${created.uuid}`).expect(200);
  });

  it('resend-confirmation is silently a no-op for an unknown email (anti-enumeration)', async () => {
    const unknownEmail = `unknown-${randomUUID()}@example.com`;

    await adminAgent
      .post('/api/users/resend-confirmation')
      .send({ email: unknownEmail })
      .expect(200);

    await deliverQueuedEmails(app, unknownEmail);

    expect(sendEmailConfirmation).not.toHaveBeenCalled();
  });

  it('resend-confirmation issues a fresh token for an unconfirmed account', async () => {
    const userRoleUuid = await getUserRoleUuid();
    const email = `resend-flow-${randomUUID()}@example.com`;
    const password = 'StrongPass123!';

    const createResponse = await adminAgent
      .post('/api/users')
      .send({
        name: 'Resend Flow User',
        email,
        password,
        roleUuids: [userRoleUuid],
      })
      .expect(201);

    const created = (createResponse.body as EnvelopeBodyLocal<{ uuid: string }>)
      .data;

    await deliverQueuedEmails(app, email);
    const originalToken = capturedTokens.get(email);
    sendEmailConfirmation.mockClear();

    await adminAgent
      .post('/api/users/resend-confirmation')
      .send({ email })
      .expect(200);

    await expect(deliverQueuedEmails(app, email)).resolves.toBe(1);
    expect(sendEmailConfirmation).toHaveBeenCalledTimes(1);
    expect(capturedTokens.get(email)).not.toBe(originalToken);

    await adminAgent.delete(`/api/users/${created.uuid}`).expect(200);
  });
});
