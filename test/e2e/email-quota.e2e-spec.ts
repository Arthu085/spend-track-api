import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  USER_NOTIFIER,
  type UserNotifier,
} from '@modules/users/application/ports/user-notifier.port';
import {
  ADMIN_CREDENTIALS,
  CSRF_COOKIE,
  CSRF_HEADER,
} from './helpers/auth-agent';
import { createTestApp } from './helpers/create-test-app';
import { deliverQueuedEmails } from './helpers/deliver-queued-emails';

interface EnvelopeBody<T> {
  data: T;
  meta: Record<string, unknown>;
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

// A dedicated, module-scoped app instance so `MAIL_DAILY_LIMIT_PASSWORD_RESET`
// is read as `1` when the `emailQuota` config factory runs at `compile()` time.
describe('Email quota (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const sendPasswordReset = jest.fn<
    Promise<void>,
    Parameters<UserNotifier['sendPasswordReset']>
  >(() => Promise.resolve());

  const sendEmailConfirmation = jest.fn((): Promise<void> => Promise.resolve());

  const capturingNotifier: UserNotifier = {
    sendEmailConfirmation,
    sendPasswordReset,
    sendUserChangeRequest: () => Promise.resolve(),
    sendEmailChangeNotice: () => Promise.resolve(),
  };

  beforeAll(() => {
    // Deliberately low so a single test can exhaust the daily quota. Overrides
    // the higher limit set by `test/e2e/setup-env.ts`.
    process.env.MAIL_DAILY_LIMIT_PASSWORD_RESET = '1';
  });

  beforeEach(async () => {
    sendPasswordReset.mockClear();
    sendEmailConfirmation.mockClear();

    app = await createTestApp({
      override: (builder) =>
        builder.overrideProvider(USER_NOTIFIER).useValue(capturingNotifier),
    });

    dataSource = app.get<DataSource>(getDataSourceToken());
    await dataSource.query(
      'TRUNCATE TABLE "email_send_logs" RESTART IDENTITY CASCADE',
    );
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "email_send_logs" RESTART IDENTITY CASCADE',
    );
    await dataSource.query('DELETE FROM "email_outbox" WHERE recipient = $1', [
      ADMIN_CREDENTIALS.email,
    ]);
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

  async function forgotPassword(email: string): Promise<request.Response> {
    const csrf = await getCsrf();

    return request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .set('Cookie', csrf.cookieHeader)
      .set(CSRF_HEADER, csrf.token)
      .send({ email });
  }

  it('allows the first forgot-password call for the seeded active user, and actually notifies', async () => {
    const response = await forgotPassword(ADMIN_CREDENTIALS.email);

    expect(response.status).toBe(200);
    expect((response.body as EnvelopeBody<null>).meta.message).toBeDefined();
    await deliverQueuedEmails(app, ADMIN_CREDENTIALS.email);
    expect(sendPasswordReset).toHaveBeenCalledTimes(1);

    const [call] = sendPasswordReset.mock.calls[0];
    expect(call.email).toBe(ADMIN_CREDENTIALS.email);
  });

  it('silently suppresses the second forgot-password call for the same recipient: identical 200 body, but the email is not sent again', async () => {
    const firstResponse = await forgotPassword(ADMIN_CREDENTIALS.email);
    expect(firstResponse.status).toBe(200);
    await deliverQueuedEmails(app, ADMIN_CREDENTIALS.email);

    const secondResponse = await forgotPassword(ADMIN_CREDENTIALS.email);

    expect(secondResponse.status).toBe(200);
    expect((secondResponse.body as EnvelopeBody<null>).meta.message).toEqual(
      (firstResponse.body as EnvelopeBody<null>).meta.message,
    );
    expect((secondResponse.body as EnvelopeBody<null>).data).toEqual(
      (firstResponse.body as EnvelopeBody<null>).data,
    );

    // Still exactly once total: the quota-denied second call never queues a
    // job, even though the HTTP response is indistinguishable from the first,
    // successful call.
    await expect(
      deliverQueuedEmails(app, ADMIN_CREDENTIALS.email),
    ).resolves.toBe(0);
    expect(sendPasswordReset).toHaveBeenCalledTimes(1);
  });

  it('keeps per-recipient budgets independent: a fresh, unregistered email is unaffected by exhausting the seeded user', async () => {
    const firstResponse = await forgotPassword(ADMIN_CREDENTIALS.email);
    expect(firstResponse.status).toBe(200);
    await deliverQueuedEmails(app, ADMIN_CREDENTIALS.email);

    const unregisteredEmail = `unknown-${randomUUID()}@example.com`;
    const thirdResponse = await forgotPassword(unregisteredEmail);

    expect(thirdResponse.status).toBe(200);
    expect(
      (thirdResponse.body as EnvelopeBody<null>).meta.message,
    ).toBeDefined();
  });

  it('the anti-enumeration property holds end-to-end: an unregistered address, requested twice, returns the identical 200 body both times (no account vs. quota exhausted are indistinguishable)', async () => {
    const unregisteredEmail = `unknown-${randomUUID()}@example.com`;

    const firstResponse = await forgotPassword(unregisteredEmail);
    expect(firstResponse.status).toBe(200);

    const secondResponse = await forgotPassword(unregisteredEmail);

    expect(secondResponse.status).toBe(200);
    expect((secondResponse.body as EnvelopeBody<null>).meta.message).toEqual(
      (firstResponse.body as EnvelopeBody<null>).meta.message,
    );
    expect((secondResponse.body as EnvelopeBody<null>).data).toEqual(
      (firstResponse.body as EnvelopeBody<null>).data,
    );

    // Unregistered address never reaches the notifier at all: its one queued
    // job completes as a no-op at delivery (unknown email), and the second
    // request was denied by the quota gate before queueing anything.
    await expect(deliverQueuedEmails(app, unregisteredEmail)).resolves.toBe(1);
    expect(sendPasswordReset).not.toHaveBeenCalled();
  });

  it('normalizes the recipient: an uppercased variant of an exhausted address still returns the identical 200 body, and the notifier is not called again (same bucket)', async () => {
    const firstResponse = await forgotPassword(ADMIN_CREDENTIALS.email);
    expect(firstResponse.status).toBe(200);
    await deliverQueuedEmails(app, ADMIN_CREDENTIALS.email);

    const variant = ADMIN_CREDENTIALS.email.toUpperCase();
    const response = await forgotPassword(variant);

    expect(response.status).toBe(200);
    expect((response.body as EnvelopeBody<null>).meta.message).toEqual(
      (firstResponse.body as EnvelopeBody<null>).meta.message,
    );
    await expect(deliverQueuedEmails(app, variant)).resolves.toBe(0);
    expect(sendPasswordReset).toHaveBeenCalledTimes(1);
  });
});
