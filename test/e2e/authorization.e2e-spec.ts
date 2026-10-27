import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { ABILITY_CATALOG } from '@modules/authorization/domain/catalog/ability-catalog';
import { Action } from '@shared/domain/enums/action.enum';
import { type AuthAgent, createAuthAgent } from './helpers/auth-agent';
import { createTestApp } from './helpers/create-test-app';

// Exact strings from `src/i18n/{pt-BR,en}/authorization.json` and
// `success.json`, asserted literally to prove real translation, not a stub.
const PT_BR = {
  roleNotFound: 'Papel não encontrado',
  updated: 'Atualizado com sucesso',
  ok: 'Operação realizada com sucesso',
  adminLabel: 'Administrador',
  userLabel: 'Usuário',
  adminRoleAbilitiesImmutable:
    'As permissões do papel Administrador não podem ser alteradas',
  actionLabels: {
    CREATE: 'Criar',
    READ: 'Ler',
    UPDATE: 'Atualizar',
    DELETE: 'Excluir',
  },
};

const EN = {
  roleNotFound: 'Role not found',
  ok: 'Operation completed successfully',
  adminLabel: 'Administrator',
  userLabel: 'User',
  adminRoleAbilitiesImmutable:
    "The Administrator role's abilities cannot be changed",
  actionLabels: {
    CREATE: 'Create',
    READ: 'Read',
    UPDATE: 'Update',
    DELETE: 'Delete',
  },
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
  requiredAbilities?: unknown;
}

interface FlattenedValidationErrorBody {
  statusCode: number;
  error: string;
  message: string[];
}

interface AbilityShape {
  uuid: string;
  action: string;
  actionLabel: string;
  subject: string;
  subjectLabel: string;
}

interface RoleListShape {
  uuid: string;
  role: string;
  roleLabel: string;
  status: string;
  statusLabel: string;
}

interface RoleDetailShape extends RoleListShape {
  abilities: AbilityShape[];
}

describe('Authorization (Roles + Abilities) (e2e)', () => {
  let app: INestApplication<App>;
  let agent: AuthAgent;

  beforeEach(async () => {
    app = await createTestApp();

    // Authenticate as ADMIN (full ability catalog) so reads and grant updates
    // are permitted.
    agent = await createAuthAgent(app);
  });

  afterEach(async () => {
    await app.close();
  });

  async function getRoleByName(name: 'ADMIN' | 'USER'): Promise<RoleListShape> {
    const response = await agent.get('/api/roles').expect(200);

    const body = response.body as EnvelopeBody<RoleListShape[]>;
    const role = body.data.find((candidate) => candidate.role === name);

    if (!role) {
      throw new Error(`Seeded role "${name}" not found — did seeds run?`);
    }

    return role;
  }

  async function getRoleDetailByName(
    name: 'ADMIN' | 'USER',
  ): Promise<RoleDetailShape> {
    const role = await getRoleByName(name);

    const response = await agent.get(`/api/roles/${role.uuid}`).expect(200);

    return (response.body as EnvelopeBody<RoleDetailShape>).data;
  }

  it('lists the fixed ability catalog', async () => {
    const response = await agent.get('/api/abilities').expect(200);

    const body = response.body as EnvelopeBody<AbilityShape[]>;

    expect(body.data).toHaveLength(ABILITY_CATALOG.length);
    expect(body.meta.message).toBe(PT_BR.ok);

    const pairs = new Set(
      body.data.map((ability) => `${ability.action}:${ability.subject}`),
    );

    for (const entry of ABILITY_CATALOG) {
      expect(pairs.has(`${entry.action}:${entry.subject}`)).toBe(true);
    }

    for (const ability of body.data) {
      const expectedLabel =
        PT_BR.actionLabels[ability.action as keyof typeof PT_BR.actionLabels];

      expect(ability.actionLabel).toBe(expectedLabel);
    }
  });

  it('localizes actionLabel on the ability catalog to English via the x-lang header', async () => {
    const response = await agent
      .get('/api/abilities')
      .set('x-lang', 'en')
      .expect(200);

    const body = response.body as EnvelopeBody<AbilityShape[]>;

    for (const ability of body.data) {
      const expectedLabel =
        EN.actionLabels[ability.action as keyof typeof EN.actionLabels];

      expect(ability.actionLabel).toBe(expectedLabel);
    }
  });

  it('lists the seeded roles with the lean list shape (no abilities)', async () => {
    const response = await agent.get('/api/roles').expect(200);

    const body = response.body as EnvelopeBody<RoleListShape[]>;

    expect(body.data).toHaveLength(2);

    const admin = body.data.find((role) => role.role === 'ADMIN');
    const user = body.data.find((role) => role.role === 'USER');

    expect(admin).not.toHaveProperty('abilities');
    expect(user).not.toHaveProperty('abilities');
    expect(admin?.roleLabel).toBe(PT_BR.adminLabel);
    expect(user?.roleLabel).toBe(PT_BR.userLabel);
    expect(admin).toMatchObject({ status: 'ACTIVE', statusLabel: 'Ativo' });
    expect(user).toMatchObject({ status: 'ACTIVE', statusLabel: 'Ativo' });
    expect(body.meta.message).toBe(PT_BR.ok);
  });

  it('gets each seeded role by uuid with its full grant set (ADMIN: full catalog, USER: one pair)', async () => {
    const admin = await getRoleDetailByName('ADMIN');
    const user = await getRoleDetailByName('USER');

    expect(admin.abilities).toHaveLength(ABILITY_CATALOG.length);
    expect(user.abilities).toHaveLength(1);
    expect(user.abilities[0]).toMatchObject({
      action: Action.READ,
      subject: 'USER',
    });
  });

  it('gets a single role by uuid', async () => {
    const admin = await getRoleByName('ADMIN');

    const response = await agent.get(`/api/roles/${admin.uuid}`).expect(200);

    const body = response.body as EnvelopeBody<RoleDetailShape>;

    expect(body.data.uuid).toBe(admin.uuid);
    expect(body.data.role).toBe('ADMIN');
    expect(body.meta.message).toBe(PT_BR.ok);
  });

  it('localizes role labels to English via the x-lang header', async () => {
    const admin = await getRoleByName('ADMIN');
    const user = await getRoleByName('USER');

    const adminResponse = await agent
      .get(`/api/roles/${admin.uuid}`)
      .set('x-lang', 'en')
      .expect(200);

    const userResponse = await agent
      .get(`/api/roles/${user.uuid}`)
      .set('x-lang', 'en')
      .expect(200);

    expect(
      (adminResponse.body as EnvelopeBody<RoleDetailShape>).data.roleLabel,
    ).toBe(EN.adminLabel);
    expect(
      (userResponse.body as EnvelopeBody<RoleDetailShape>).data.roleLabel,
    ).toBe(EN.userLabel);
  });

  it('returns a localized 404 for a non-existent role, pt-BR by default and en via x-lang', async () => {
    const missingUuid = randomUUID();

    const ptResponse = await agent.get(`/api/roles/${missingUuid}`).expect(404);

    const ptBody = ptResponse.body as ErrorBody;

    expect(ptBody.message).toBe(PT_BR.roleNotFound);

    const enResponse = await agent
      .get(`/api/roles/${missingUuid}`)
      .set('x-lang', 'en')
      .expect(404);

    const enBody = enResponse.body as ErrorBody;

    expect(enBody.message).toBe(EN.roleNotFound);
  });

  // A malformed `:uuid` path param must be rejected with a translated 400
  // before reaching the repository, not surface as a 500 from TypeORM.
  it('rejects a malformed :uuid path param with a translated 400 instead of a 500', async () => {
    const malformedUuid = 'not-a-uuid';

    const response = await agent.get(`/api/roles/${malformedUuid}`).expect(400);

    const body = response.body as ErrorBody;

    expect(body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'O campo uuid deve ser um UUID válido',
      timestamp: expect.any(String) as string,
      path: `/api/roles/${malformedUuid}`,
    });
  });

  it('localizes the malformed :uuid path param message to English via the x-lang header', async () => {
    const response = await agent
      .get('/api/roles/not-a-uuid')
      .set('x-lang', 'en')
      .expect(400);

    const body = response.body as ErrorBody;

    expect(body.message).toBe('The uuid field must be a valid UUID');
  });

  it('replaces a role’s ability grants (idempotent no-op against its seeded baseline)', async () => {
    const user = await getRoleByName('USER');

    // Seeded baseline: USER gets exactly READ + User. Sent explicitly rather
    // than derived from the live read, which would round-trip a drifted grant
    // set as a passing no-op.
    const seededPairs = [{ action: Action.READ, subject: 'USER' }];

    const response = await agent
      .patch(`/api/roles/${user.uuid}/abilities`)
      .send({ abilities: seededPairs })
      .expect(200);

    const body = response.body as EnvelopeBody<RoleDetailShape>;

    expect(body.data.abilities).toHaveLength(1);
    expect(body.data.abilities[0]).toMatchObject({
      action: Action.READ,
      subject: 'USER',
    });
    expect(body.meta.message).toBe(PT_BR.updated);
  });

  // `subject` is validated with `@IsEnum(Subject)`, so a non-catalog string is
  // rejected by DTO validation (400) before reaching the use-case's
  // `UnknownAbilityError` (422), which `update-role-abilities.use-case.spec.ts`
  // covers.
  it('rejects a non-enum subject via DTO validation, localized pt-BR by default and en via x-lang', async () => {
    const user = await getRoleByName('USER');

    const payload = {
      abilities: [{ action: Action.READ, subject: 'NotARealSubject' }],
    };

    const ptResponse = await agent
      .patch(`/api/roles/${user.uuid}/abilities`)
      .send(payload)
      .expect(400);

    const ptBody = ptResponse.body as FlattenedValidationErrorBody;

    expect(ptBody.statusCode).toBe(400);
    expect(ptBody.message).toEqual([
      'O campo abilities.0.subject possui um valor inválido',
    ]);

    const enResponse = await agent
      .patch(`/api/roles/${user.uuid}/abilities`)
      .set('x-lang', 'en')
      .send(payload)
      .expect(400);

    const enBody = enResponse.body as FlattenedValidationErrorBody;

    expect(enBody.message).toEqual([
      'The abilities.0.subject field has an invalid value',
    ]);
  });

  it('rejects duplicate ability pairs via DTO validation, localized pt-BR by default and en via x-lang', async () => {
    const user = await getRoleByName('USER');

    const payload = {
      abilities: [
        { action: Action.READ, subject: 'USER' },
        { action: Action.READ, subject: 'USER' },
      ],
    };

    const ptResponse = await agent
      .patch(`/api/roles/${user.uuid}/abilities`)
      .send(payload)
      .expect(400);

    const ptBody = ptResponse.body as FlattenedValidationErrorBody;

    expect(ptBody.statusCode).toBe(400);
    expect(ptBody.message).toEqual([
      'O campo abilities não pode conter itens duplicados',
    ]);

    const enResponse = await agent
      .patch(`/api/roles/${user.uuid}/abilities`)
      .set('x-lang', 'en')
      .send(payload)
      .expect(400);

    const enBody = enResponse.body as FlattenedValidationErrorBody;

    expect(enBody.message).toEqual([
      'The abilities field must not contain duplicate items',
    ]);
  });

  it('reports a missing abilities field as required, not as a duplicate-items error', async () => {
    const user = await getRoleByName('USER');

    const response = await agent
      .patch(`/api/roles/${user.uuid}/abilities`)
      .set('x-lang', 'en')
      .send({})
      .expect(400);

    const body = response.body as FlattenedValidationErrorBody;

    expect(body.message).toEqual(['The abilities field is required']);
  });

  it('refuses to change the ADMIN role’s abilities, localized pt-BR by default and en via x-lang', async () => {
    const admin = await getRoleByName('ADMIN');

    const payload = {
      abilities: [{ action: Action.READ, subject: 'USER' }],
    };

    const ptResponse = await agent
      .patch(`/api/roles/${admin.uuid}/abilities`)
      .send(payload)
      .expect(403);

    const ptBody = ptResponse.body as ErrorBody;

    expect(ptBody.message).toBe(PT_BR.adminRoleAbilitiesImmutable);
    expect('requiredAbilities' in ptBody).toBe(false);

    const enResponse = await agent
      .patch(`/api/roles/${admin.uuid}/abilities`)
      .set('x-lang', 'en')
      .send(payload)
      .expect(403);

    const enBody = enResponse.body as ErrorBody;

    expect(enBody.message).toBe(EN.adminRoleAbilitiesImmutable);

    const reloadedAdmin = await getRoleDetailByName('ADMIN');

    expect(reloadedAdmin.abilities).toHaveLength(ABILITY_CATALOG.length);
  });
});
