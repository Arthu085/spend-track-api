import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { READINESS_CHECK_TIMEOUT_MS } from '@core/health/services/readiness.service';
import { createTestApp } from './helpers/create-test-app';
import { startTcpProxy, type TcpProxy } from './helpers/tcp-proxy';

// Routes this app's database connections through a proxy in front of the
// shared test Postgres, so the spec can take PostgreSQL away from this app
// alone and bring it back.
describe('Health readiness against PostgreSQL outages (e2e)', () => {
  const originalEnv = {
    DB_HOST: process.env.DB_HOST,
    DB_PORT: process.env.DB_PORT,
  };

  let proxy: TcpProxy;
  let app: NestExpressApplication;

  beforeAll(async () => {
    proxy = await startTcpProxy(
      originalEnv.DB_HOST as string,
      Number(originalEnv.DB_PORT),
    );

    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_PORT = String(proxy.port);

    app = await createTestApp();
  });

  afterEach(() => {
    proxy.setMode('forward');
  });

  afterAll(async () => {
    proxy.setMode('forward');
    await app.close();
    await proxy.close();

    Object.assign(process.env, originalEnv);
  });

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('Accept-Language', 'en');

  const expectReadyEventually = async (): Promise<void> => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const { status } = await get('/api/health/ready');

      if (status === 200) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    throw new Error('Readiness did not recover after PostgreSQL came back');
  };

  it('is ready while PostgreSQL answers', async () => {
    await get('/api/health/ready').expect(200);
  });

  it('returns 503 with the standard error shape when PostgreSQL refuses connections', async () => {
    proxy.setMode('refuse');

    const response = await get('/api/health/ready').expect(503);

    expect(response.body).toEqual({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'The service is not ready to handle requests',
      timestamp: expect.any(String) as string,
      path: '/api/health/ready',
    });
  });

  it('leaks no database details in the 503 body', async () => {
    proxy.setMode('refuse');

    const { text } = await get('/api/health/ready').expect(503);

    for (const secret of [
      String(proxy.port),
      originalEnv.DB_PORT as string,
      process.env.DB_USER as string,
      process.env.DB_PASSWORD as string,
      process.env.DB_NAME as string,
      'ECONN',
      'terminated',
      'SELECT',
      'postgres',
      ' at ',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('returns 503 within a bounded time when PostgreSQL stops answering', async () => {
    proxy.setMode('stall');

    // Pooled connections the switch just dropped fail fast; the first check
    // that has to open a new connection meets the stall.
    let elapsedMs = 0;

    for (
      let attempt = 0;
      attempt < 5 && elapsedMs < READINESS_CHECK_TIMEOUT_MS - 100;
      attempt++
    ) {
      const startedAt = Date.now();
      await get('/api/health/ready').expect(503);
      elapsedMs = Date.now() - startedAt;
    }

    expect(elapsedMs).toBeGreaterThanOrEqual(READINESS_CHECK_TIMEOUT_MS - 100);
    expect(elapsedMs).toBeLessThan(READINESS_CHECK_TIMEOUT_MS + 2_000);
  });

  it('recovers on its own when pooled connections go silent but PostgreSQL is reachable', async () => {
    await get('/api/health/ready').expect(200);
    proxy.stallOpenConnections();

    // Each stalled pooled connection costs one bounded 503 and is then
    // discarded, so readiness reaches 200 without the proxy closing anything.
    let status = 503;

    for (let attempt = 0; attempt < 5 && status !== 200; attempt++) {
      const startedAt = Date.now();
      ({ status } = await get('/api/health/ready'));

      expect([200, 503]).toContain(status);
      expect(Date.now() - startedAt).toBeLessThan(
        READINESS_CHECK_TIMEOUT_MS + 2_000,
      );
    }

    expect(status).toBe(200);
  });

  it('keeps liveness at 200 while PostgreSQL is unavailable', async () => {
    proxy.setMode('refuse');

    await get('/api/health/live').expect(200);
  });

  it('becomes ready again once PostgreSQL is back', async () => {
    proxy.setMode('refuse');
    await get('/api/health/ready').expect(503);

    proxy.setMode('forward');

    await expectReadyEventually();
  });
});
