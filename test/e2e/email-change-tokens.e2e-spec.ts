import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import {
  EMAIL_QUOTA_PORT,
  type EmailQuotaPort,
} from '@shared/application/ports';
import {
  USER_NOTIFIER,
  type UserNotifier,
} from '@modules/users/application/ports/user-notifier.port';
import { type AuthAgent, createAuthAgent } from './helpers/auth-agent';
import { createTestApp } from './helpers/create-test-app';
import { deliverQueuedEmails } from './helpers/deliver-queued-emails';

interface EnvelopeBody<T> {
  data: T;
  meta: Record<string, unknown>;
}

interface UserBody {
  uuid: string;
  email: string;
  emailConfirmedAt: string | null;
}

// Changing a user's email must kill every confirmation and reset link sent to
// the previous address, whether or not a new confirmation can be sent, and
// whatever order concurrent requests land in.
describe('Email change token invalidation (e2e)', () => {
  let app: INestApplication<App>;
  let adminAgent: AuthAgent;

  const confirmationLinks = new Map<string, string>();
  const resetLinks = new Map<string, string>();

  const sendEmailConfirmation = jest.fn(
    (input: { email: string; token: string }): Promise<void> => {
      confirmationLinks.set(input.email, input.token);
      return Promise.resolve();
    },
  );

  const sendPasswordReset = jest.fn(
    (input: { email: string; token: string }): Promise<void> => {
      resetLinks.set(input.email, input.token);
      return Promise.resolve();
    },
  );

  const notifier: UserNotifier = {
    sendEmailConfirmation,
    sendPasswordReset,
    sendUserChangeRequest: () => Promise.resolve(),
    sendEmailChangeNotice: () => Promise.resolve(),
  };

  // Stands in for the per-day quota so a test can exhaust the confirmation
  // allowance without a dedicated app or a low global limit.
  const quota = { confirmationAllowed: true };

  const emailQuota: EmailQuotaPort = {
    tryConsume: ({ emailType }) =>
      Promise.resolve(
        emailType !== EmailType.EMAIL_CONFIRMATION || quota.confirmationAllowed
          ? { allowed: true, used: 1, limit: 5 }
          : { allowed: false, reason: 'EXHAUSTED', used: 5, limit: 5 },
      ),
  };

  beforeEach(async () => {
    confirmationLinks.clear();
    resetLinks.clear();
    sendEmailConfirmation.mockClear();
    sendPasswordReset.mockClear();
    quota.confirmationAllowed = true;

    app = await createTestApp({
      override: (builder) =>
        builder
          .overrideProvider(USER_NOTIFIER)
          .useValue(notifier)
          .overrideProvider(EMAIL_QUOTA_PORT)
          .useValue(emailQuota),
    });

    adminAgent = await createAuthAgent(app);
  });

  afterEach(async () => {
    await app.close();
  });

  async function getUserRoleUuid(): Promise<string> {
    const response = await adminAgent.get('/api/roles').expect(200);

    const body = response.body as EnvelopeBody<
      Array<{ uuid: string; role: string }>
    >;

    const role = body.data.find((candidate) => candidate.role === 'USER');

    if (!role) {
      throw new Error('Seeded USER role not found — did seeds run?');
    }

    return role.uuid;
  }

  // Creates a user and collects both kinds of link for the original address.
  async function createUserWithOutstandingLinks(): Promise<{
    uuid: string;
    email: string;
    roleUuid: string;
    confirmationLink: string;
    resetLink: string;
  }> {
    const roleUuid = await getUserRoleUuid();
    const email = `email-change-${randomUUID()}@example.com`;

    const created = await adminAgent
      .post('/api/users')
      .send({
        name: 'Email Change User',
        email,
        password: 'StrongPass123!',
        roleUuids: [roleUuid],
      })
      .expect(201);

    await adminAgent
      .post('/api/auth/forgot-password')
      .send({ email })
      .expect(200);
    await deliverQueuedEmails(app, email);

    const confirmationLink = confirmationLinks.get(email);
    const resetLink = resetLinks.get(email);

    if (!confirmationLink || !resetLink) {
      throw new Error('Expected both links for the original address');
    }

    return {
      uuid: (created.body as EnvelopeBody<UserBody>).data.uuid,
      email,
      roleUuid,
      confirmationLink,
      resetLink,
    };
  }

  function patchEmail(uuid: string, email: string, roleUuid: string) {
    return adminAgent
      .patch(`/api/users/${uuid}`)
      .send({ name: 'Email Change User', email, roleUuids: [roleUuid] });
  }

  async function getUser(uuid: string): Promise<UserBody> {
    const response = await adminAgent.get(`/api/users/${uuid}`).expect(200);
    return (response.body as EnvelopeBody<UserBody>).data;
  }

  function confirm(token: string) {
    return adminAgent.post('/api/users/confirm-email').send({ token });
  }

  function reset(token: string) {
    return adminAgent
      .post('/api/auth/reset-password')
      .send({ token, password: 'AnotherStrongPass123!' });
  }

  it('rejects confirmation and reset links sent to the old address, and confirms only through the new one', async () => {
    const user = await createUserWithOutstandingLinks();
    const newEmail = `email-change-new-${randomUUID()}@example.com`;

    const patched = await patchEmail(user.uuid, newEmail, user.roleUuid).expect(
      200,
    );

    expect((patched.body as EnvelopeBody<UserBody>).data).toMatchObject({
      email: newEmail,
      emailConfirmedAt: null,
    });

    await confirm(user.confirmationLink).expect(422);
    await reset(user.resetLink).expect(422);
    await expect(getUser(user.uuid)).resolves.toMatchObject({
      email: newEmail,
      emailConfirmedAt: null,
    });

    await deliverQueuedEmails(app, newEmail);

    const newLink = confirmationLinks.get(newEmail);
    expect(newLink).toBeDefined();
    await confirm(newLink!).expect(200);

    const confirmed = await getUser(user.uuid);
    expect(confirmed.email).toBe(newEmail);
    expect(confirmed.emailConfirmedAt).not.toBeNull();
  });

  it('still kills the old links when the confirmation quota is exhausted, and resend recovers once it allows again', async () => {
    const user = await createUserWithOutstandingLinks();
    const newEmail = `email-change-new-${randomUUID()}@example.com`;
    quota.confirmationAllowed = false;
    sendEmailConfirmation.mockClear();

    await patchEmail(user.uuid, newEmail, user.roleUuid).expect(200);

    await expect(deliverQueuedEmails(app, newEmail)).resolves.toBe(0);
    expect(sendEmailConfirmation).not.toHaveBeenCalled();
    await confirm(user.confirmationLink).expect(422);
    await reset(user.resetLink).expect(422);

    quota.confirmationAllowed = true;
    await adminAgent
      .post('/api/users/resend-confirmation')
      .send({ email: newEmail })
      .expect(200);
    await deliverQueuedEmails(app, newEmail);

    await confirm(confirmationLinks.get(newEmail)!).expect(200);
  });

  it.each([1, 2, 3])(
    'never leaves the new address confirmed by an old link when the change and a confirmation race (round %i)',
    async () => {
      const user = await createUserWithOutstandingLinks();
      const newEmail = `email-change-race-${randomUUID()}@example.com`;

      const [patched] = await Promise.all([
        patchEmail(user.uuid, newEmail, user.roleUuid),
        confirm(user.confirmationLink),
      ]);

      expect(patched.status).toBe(200);
      await expect(getUser(user.uuid)).resolves.toMatchObject({
        email: newEmail,
        emailConfirmedAt: null,
      });
      await confirm(user.confirmationLink).expect(422);
    },
  );

  it.each([1, 2, 3])(
    'never restores the old address or confirms the new one when the change and a password reset race (round %i)',
    async () => {
      const user = await createUserWithOutstandingLinks();
      const newEmail = `email-change-race-${randomUUID()}@example.com`;

      const [patched] = await Promise.all([
        patchEmail(user.uuid, newEmail, user.roleUuid),
        reset(user.resetLink),
      ]);

      expect(patched.status).toBe(200);
      await expect(getUser(user.uuid)).resolves.toMatchObject({
        email: newEmail,
        emailConfirmedAt: null,
      });
      await reset(user.resetLink).expect(422);
    },
  );
});
