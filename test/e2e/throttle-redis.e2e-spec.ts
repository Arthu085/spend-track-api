import 'reflect-metadata';
import { setTimeout as sleep } from 'node:timers/promises';
import { Controller } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  RedisContainer,
  type StartedRedisContainer,
} from '@testcontainers/redis';
import Redis from 'ioredis';
import request from 'supertest';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { CoreHealthModule } from '@core/health';
import { CoreHttpModule } from '@core/http';
import { CoreI18nModule } from '@core/i18n';
import { CoreThrottlerModule, THROTTLER_REDIS_CLIENT } from '@core/throttler';
import { REDIS_COMMAND_TIMEOUT_MS } from '@core/throttler/throttler-redis.client';
import { endpoint } from '@shared/index';
import { PublicAuthFlowThrottle } from '@shared/presentation/throttling';
import { createTestApp } from './helpers/create-test-app';
import { startTcpProxy, type TcpProxy } from './helpers/tcp-proxy';

const REDIS_IMAGE = 'redis:7-alpine';

const THROTTLE_LIMIT = 4;

const AUTH_THROTTLE_LIMIT = 2;

const CLIENT_A = '203.0.113.10';

const CLIENT_B = '198.51.100.20';

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

// Each app plays one API replica. They share the Redis container, so a
// budget spent on one replica must be visible on the others.
const createReplica = (redisUrl: string): Promise<NestExpressApplication> => {
  process.env.THROTTLE_REDIS_URL = redisUrl;

  return createTestApp({
    imports: [
      CoreConfigModule,
      CoreI18nModule,
      CoreHttpModule,
      DatabaseModule,
      CoreThrottlerModule,
      CoreHealthModule,
    ],
    controllers: [ThrottledController],
  });
};

// Supertest connects over loopback, which `TRUST_PROXY=loopback` treats as
// the reverse proxy, so `X-Forwarded-For` carries the client address.
const callAs = (app: NestExpressApplication, path: string, client = CLIENT_A) =>
  request(app.getHttpServer())
    .get(path)
    .set('X-Forwarded-For', client)
    .set('Accept-Language', 'en');

describe('Redis-backed throttling across instances (e2e)', () => {
  const originalEnv = {
    THROTTLE_LIMIT: process.env.THROTTLE_LIMIT,
    AUTH_THROTTLE_LIMIT: process.env.AUTH_THROTTLE_LIMIT,
    THROTTLE_TTL: process.env.THROTTLE_TTL,
    AUTH_THROTTLE_TTL: process.env.AUTH_THROTTLE_TTL,
    TRUST_PROXY: process.env.TRUST_PROXY,
    THROTTLE_REDIS_URL: process.env.THROTTLE_REDIS_URL,
  };

  let container: StartedRedisContainer;
  let admin: Redis;
  let replicaA: NestExpressApplication;
  let replicaB: NestExpressApplication;

  beforeAll(async () => {
    container = await new RedisContainer(REDIS_IMAGE).start();
    admin = new Redis(container.getConnectionUrl());

    process.env.THROTTLE_LIMIT = String(THROTTLE_LIMIT);
    process.env.AUTH_THROTTLE_LIMIT = String(AUTH_THROTTLE_LIMIT);
    process.env.THROTTLE_TTL = '60';
    process.env.AUTH_THROTTLE_TTL = '60';
    process.env.TRUST_PROXY = 'loopback';

    replicaA = await createReplica(container.getConnectionUrl());
    replicaB = await createReplica(container.getConnectionUrl());
  }, 120_000);

  beforeEach(async () => {
    await admin.flushall();
  });

  afterAll(async () => {
    await replicaA?.close();
    await replicaB?.close();
    await admin?.quit();
    await container?.stop();

    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('shares the global THROTTLE_LIMIT between instances', async () => {
    for (let i = 0; i < THROTTLE_LIMIT; i++) {
      const replica = i % 2 === 0 ? replicaA : replicaB;

      await callAs(replica, '/api/regular')
        .expect(200)
        .expect('X-RateLimit-Limit', String(THROTTLE_LIMIT))
        .expect('X-RateLimit-Remaining', String(THROTTLE_LIMIT - i - 1));
    }

    await callAs(replicaA, '/api/regular').expect(429);
    await callAs(replicaB, '/api/regular').expect(429);
  });

  it('shares the AUTH_THROTTLE_LIMIT of PublicAuthFlowThrottle() routes between instances', async () => {
    for (let i = 0; i < AUTH_THROTTLE_LIMIT; i++) {
      await callAs(replicaA, '/api/auth-flow')
        .expect(200)
        .expect('X-RateLimit-Limit', String(AUTH_THROTTLE_LIMIT));
    }

    const response = await callAs(replicaB, '/api/auth-flow').expect(429);

    expect(response.body).toEqual(
      expect.objectContaining({
        statusCode: 429,
        message: 'Too many requests. Please try again later.',
      }),
    );
    await callAs(replicaB, '/api/regular').expect(200);
  });

  it('keeps forwarded clients in separate buckets across instances', async () => {
    for (let i = 0; i < AUTH_THROTTLE_LIMIT; i++) {
      await callAs(replicaA, '/api/auth-flow', CLIENT_A).expect(200);
    }

    await callAs(replicaB, '/api/auth-flow', CLIENT_A).expect(429);
    await callAs(replicaB, '/api/auth-flow', CLIENT_B).expect(200);
  });

  it('keeps counters when an instance restarts', async () => {
    for (let i = 0; i < AUTH_THROTTLE_LIMIT; i++) {
      await callAs(replicaA, '/api/auth-flow').expect(200);
    }

    await replicaA.close();
    replicaA = await createReplica(container.getConnectionUrl());

    await callAs(replicaA, '/api/auth-flow').expect(429);
  });

  it('refuses to boot when Redis is unreachable', async () => {
    process.env.THROTTLE_REDIS_URL = 'redis://127.0.0.1:1';

    // Without CoreI18nModule: its file watcher would outlive the failed boot.
    await expect(
      createTestApp({ imports: [CoreConfigModule, CoreThrottlerModule] }),
    ).rejects.toThrow();
  });

  // Pins the counting semantics of @nestjs/throttler's in-memory storage, which
  // the Redis script mirrors: a fixed window would reset at its boundary and
  // count retries made while blocked.
  describe('with short windows', () => {
    const SHORT_THROTTLE_TTL_MS = 2_000;

    const SHORT_AUTH_THROTTLE_TTL_MS = 1_000;

    let replica: NestExpressApplication;

    beforeAll(async () => {
      process.env.THROTTLE_TTL = String(SHORT_THROTTLE_TTL_MS / 1_000);
      process.env.AUTH_THROTTLE_TTL = String(
        SHORT_AUTH_THROTTLE_TTL_MS / 1_000,
      );
      replica = await createReplica(container.getConnectionUrl());
      process.env.THROTTLE_TTL = '60';
      process.env.AUTH_THROTTLE_TTL = '60';
    });

    afterAll(async () => {
      await replica.close();
    });

    it('expires each hit on its own instead of resetting the whole window', async () => {
      const firstHitAt = Date.now();

      await callAs(replica, '/api/regular').expect(200);
      await sleep(SHORT_THROTTLE_TTL_MS * 0.6);

      for (let i = 1; i < THROTTLE_LIMIT; i++) {
        await callAs(replica, '/api/regular').expect(200);
      }

      await sleep(firstHitAt + SHORT_THROTTLE_TTL_MS + 200 - Date.now());

      await callAs(replica, '/api/regular')
        .expect(200)
        .expect('X-RateLimit-Remaining', '0');
      await callAs(replica, '/api/regular').expect(429);
    });

    it('ignores retries made while blocked and restores the full budget afterwards', async () => {
      for (let i = 0; i < AUTH_THROTTLE_LIMIT; i++) {
        await callAs(replica, '/api/auth-flow').expect(200);
      }

      const blockedAt = Date.now();

      await callAs(replica, '/api/auth-flow')
        .expect(429)
        .expect('Retry-After', String(SHORT_AUTH_THROTTLE_TTL_MS / 1_000));

      for (let i = 0; i < 3; i++) {
        await sleep(150);
        await callAs(replica, '/api/auth-flow').expect(429);
      }

      await sleep(blockedAt + SHORT_AUTH_THROTTLE_TTL_MS + 200 - Date.now());

      for (let i = 0; i < AUTH_THROTTLE_LIMIT; i++) {
        await callAs(replica, '/api/auth-flow').expect(200);
      }

      await callAs(replica, '/api/auth-flow').expect(429);
    });
  });

  // This replica reaches Redis through a TCP proxy, so the spec can take Redis
  // away from it alone while the other replicas keep the shared container.
  describe('when Redis becomes unavailable', () => {
    let proxy: TcpProxy;
    let replica: NestExpressApplication;

    beforeAll(async () => {
      proxy = await startTcpProxy(
        container.getHost(),
        container.getFirstMappedPort(),
      );
      replica = await createReplica(`redis://127.0.0.1:${proxy.port}`);
    });

    // Waits for the client's own reconnect, so each test starts connected.
    afterEach(async () => {
      proxy.setMode('forward');

      const redis = replica.get<Redis>(THROTTLER_REDIS_CLIENT);

      for (
        let attempt = 0;
        attempt < 40 && redis.status !== 'ready';
        attempt++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    });

    afterAll(async () => {
      await replica.close();
      await proxy.close();
    });

    const expectThrottledRouteEventually = async (
      status: number,
    ): Promise<void> => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const response = await callAs(replica, '/api/regular');

        if (response.status === status) {
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      throw new Error(`Throttled route never answered ${status}`);
    };

    it('fails closed with a localized 503 when Redis refuses connections', async () => {
      proxy.setMode('refuse');

      const response = await callAs(replica, '/api/regular').expect(503);

      expect(response.body).toEqual({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'The service is not ready to handle requests',
        timestamp: expect.any(String) as string,
        path: '/api/regular',
      });
      expect(response.text).not.toContain(String(proxy.port));
    });

    it('fails closed within the command timeout when Redis stops answering', async () => {
      await callAs(replica, '/api/regular').expect(200);
      proxy.stallOpenConnections();

      const startedAt = Date.now();

      await callAs(replica, '/api/regular').expect(503);

      expect(Date.now() - startedAt).toBeLessThan(
        REDIS_COMMAND_TIMEOUT_MS + 1_000,
      );
    });

    it('turns readiness to 503 and keeps liveness at 200', async () => {
      proxy.setMode('refuse');

      await callAs(replica, '/api/health/ready').expect(503);
      await callAs(replica, '/api/health/live').expect(200);
    });

    it('recovers once Redis is reachable again', async () => {
      proxy.setMode('refuse');
      await callAs(replica, '/api/regular').expect(503);

      proxy.setMode('forward');

      await expectThrottledRouteEventually(200);
      await callAs(replica, '/api/health/ready').expect(200);
    });
  });
});
