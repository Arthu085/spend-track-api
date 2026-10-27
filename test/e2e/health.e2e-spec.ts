import type { NestExpressApplication } from '@nestjs/platform-express';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createTestApp } from './helpers/create-test-app';

const THROTTLE_LIMIT = 2;

const HEALTH_PATHS = ['/api/health/live', '/api/health/ready'];

describe('Health endpoints (e2e)', () => {
  const originalThrottleLimit = process.env.THROTTLE_LIMIT;

  let app: NestExpressApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    process.env.THROTTLE_LIMIT = String(THROTTLE_LIMIT);
    app = await createTestApp();
    dataSource = app.get<DataSource>(getDataSourceToken());
  });

  afterAll(async () => {
    await app.close();

    if (originalThrottleLimit === undefined) {
      delete process.env.THROTTLE_LIMIT;
    } else {
      process.env.THROTTLE_LIMIT = originalThrottleLimit;
    }
  });

  const get = (path: string) => request(app.getHttpServer()).get(path);

  it.each(HEALTH_PATHS)(
    'GET %s returns 200 without authentication',
    async (path) => {
      const response = await get(path).expect(200);

      expect(response.body).toEqual({ data: { status: 'ok' }, meta: {} });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['set-cookie']).toBeUndefined();
    },
  );

  it.each(HEALTH_PATHS)(
    'GET %s ignores an invalid access token cookie',
    async (path) => {
      await get(path)
        .set('Cookie', 'access_token=s%3Anot-a-jwt.bad')
        .expect(200);
    },
  );

  it.each(HEALTH_PATHS)(
    'GET %s never consumes a rate-limit budget',
    async (path) => {
      for (let i = 0; i < THROTTLE_LIMIT * 3; i++) {
        const response = await get(path).expect(200);

        expect(response.headers['x-ratelimit-limit']).toBeUndefined();
      }
    },
  );

  it('still throttles regular routes in the same app', async () => {
    await get('/api/auth/csrf')
      .expect(200)
      .expect('X-RateLimit-Limit', String(THROTTLE_LIMIT));
  });

  it('writes no audit log rows', async () => {
    for (const path of HEALTH_PATHS) {
      await get(path).expect(200);
    }

    const [{ count }] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM audit_logs WHERE path LIKE '/api/health%'`,
    );

    expect(Number(count)).toBe(0);
  });

  it('still requires authentication on protected routes', async () => {
    await get('/api/users/me').expect(401);
  });
});
