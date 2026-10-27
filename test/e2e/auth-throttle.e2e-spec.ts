import 'reflect-metadata';
import { setTimeout as sleep } from 'node:timers/promises';
import { Controller } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { CoreConfigModule } from '@core/config';
import { CoreHttpModule } from '@core/http';
import { CoreI18nModule } from '@core/i18n';
import { CoreThrottlerModule } from '@core/throttler';
import { SECOND_IN_MS } from '@shared/application/time';
import { endpoint } from '@shared/index';
import { PublicAuthFlowThrottle } from '@shared/presentation/throttling';
import { createTestApp } from './helpers/create-test-app';

const THROTTLE_LIMIT = 4;

const AUTH_THROTTLE_LIMIT = 2;

const SHORT_AUTH_THROTTLE_TTL_SECONDS = 1;

const SHORT_THROTTLE_TTL_SECONDS = 3;

@Controller()
class ThrottledController {
  @(endpoint().get('regular').public().build())
  regular(): { ok: true } {
    return { ok: true };
  }

  @(endpoint().get('auth-flow').public().use(PublicAuthFlowThrottle()).build())
  authFlow(): { ok: true } {
    return { ok: true };
  }
}

describe('Auth flow throttling (e2e)', () => {
  const originalEnv = {
    THROTTLE_LIMIT: process.env.THROTTLE_LIMIT,
    AUTH_THROTTLE_LIMIT: process.env.AUTH_THROTTLE_LIMIT,
    THROTTLE_TTL: process.env.THROTTLE_TTL,
    AUTH_THROTTLE_TTL: process.env.AUTH_THROTTLE_TTL,
  };

  let app: NestExpressApplication;

  const createThrottledApp = () =>
    createTestApp({
      imports: [
        CoreConfigModule,
        CoreI18nModule,
        CoreHttpModule,
        CoreThrottlerModule,
      ],
      controllers: [ThrottledController],
    });

  beforeEach(async () => {
    process.env.THROTTLE_LIMIT = String(THROTTLE_LIMIT);
    process.env.AUTH_THROTTLE_LIMIT = String(AUTH_THROTTLE_LIMIT);
    delete process.env.THROTTLE_TTL;
    delete process.env.AUTH_THROTTLE_TTL;

    app = await createThrottledApp();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  const call = (path: string) => request(app.getHttpServer()).get(path);

  it('limits PublicAuthFlowThrottle() routes to AUTH_THROTTLE_LIMIT', async () => {
    for (let i = 0; i < AUTH_THROTTLE_LIMIT; i++) {
      await call('/api/auth-flow')
        .expect(200)
        .expect('X-RateLimit-Limit', String(AUTH_THROTTLE_LIMIT));
    }

    await call('/api/auth-flow').expect(429);
  });

  it('keeps the global THROTTLE_LIMIT on other routes', async () => {
    for (let i = 0; i < THROTTLE_LIMIT; i++) {
      await call('/api/regular')
        .expect(200)
        .expect('X-RateLimit-Limit', String(THROTTLE_LIMIT));
    }

    await call('/api/regular').expect(429);
  });

  it('answers 429 with a localized message', async () => {
    for (let i = 0; i < AUTH_THROTTLE_LIMIT; i++) {
      await call('/api/auth-flow').expect(200);
    }

    const ptResponse = await call('/api/auth-flow').expect(429);

    const enResponse = await call('/api/auth-flow')
      .set('x-lang', 'en')
      .expect(429);

    expect(ptResponse.body).toEqual(
      expect.objectContaining({
        statusCode: 429,
        message: 'Muitas requisições. Tente novamente mais tarde.',
      }),
    );
    expect(enResponse.body).toEqual(
      expect.objectContaining({
        statusCode: 429,
        message: 'Too many requests. Please try again later.',
      }),
    );
  });

  // Regression for @nestjs/throttler 6.5.0: an expired block on one route
  // cancelled the hit-expiry timers of every other route, so their counters
  // never decreased and kept returning 429 before reaching the limit.
  it('keeps hits on other routes expiring after a block on one route ends', async () => {
    process.env.THROTTLE_TTL = String(SHORT_THROTTLE_TTL_SECONDS);
    process.env.AUTH_THROTTLE_TTL = String(SHORT_AUTH_THROTTLE_TTL_SECONDS);
    await app.close();
    app = await createThrottledApp();

    for (let i = 0; i < AUTH_THROTTLE_LIMIT; i++) {
      await call('/api/auth-flow').expect(200);
    }
    await call('/api/auth-flow').expect(429);

    for (let i = 0; i < THROTTLE_LIMIT; i++) {
      await call('/api/regular').expect(200);
    }

    const regularHitsExpireAt =
      Date.now() + SHORT_THROTTLE_TTL_SECONDS * SECOND_IN_MS;

    await sleep(SHORT_AUTH_THROTTLE_TTL_SECONDS * SECOND_IN_MS + 200);
    await call('/api/auth-flow').expect(200);

    await sleep(regularHitsExpireAt - Date.now() + 200);
    await call('/api/regular')
      .expect(200)
      .expect('X-RateLimit-Remaining', String(THROTTLE_LIMIT - 1));
  });
});
