import 'reflect-metadata';
import { Controller, Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { CoreConfigModule } from '@core/config';
import { CoreHttpModule } from '@core/http';
import { CoreI18nModule } from '@core/i18n';
import { CoreThrottlerModule } from '@core/throttler';
import { AuditContextGuard } from '@modules/audit/presentation/guards/audit-context.guard';
import { AuditInterceptor } from '@modules/audit/presentation/interceptors/audit.interceptor';
import {
  AUDIT_LOG_PORT,
  endpoint,
  type AuditLogPort,
  type AuditRecordInput,
} from '@shared/index';
import { createTestApp } from './helpers/create-test-app';

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const THROTTLE_LIMIT = 2;

const CLIENT_A = '203.0.113.10';

const CLIENT_B = '198.51.100.20';

const LOOPBACK_PEER: unknown = expect.stringMatching(
  /^(::ffff:127\.0\.0\.1|127\.0\.0\.1|::1)$/,
);

const records: AuditRecordInput[] = [];

const auditLogSpy: AuditLogPort = {
  record: (input: AuditRecordInput): Promise<void> => {
    records.push(input);
    return Promise.resolve();
  },
};

// In-memory audit port, mirroring `audit.e2e-spec.ts`; imported before
// `CoreThrottlerModule` like `AppModule` so throttled 429s are audited too.
@Global()
@Module({
  providers: [
    { provide: AUDIT_LOG_PORT, useValue: auditLogSpy },
    { provide: APP_GUARD, useClass: AuditContextGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AUDIT_LOG_PORT],
})
class TestAuditModule {}

@Controller()
class ClientIpController {
  @(endpoint().get('client-ip').audit('Thing.read').build())
  clientIp(): { ok: true } {
    return { ok: true };
  }
}

// Supertest connects over loopback, so the socket peer (127.0.0.1) plays the
// reverse proxy and `X-Forwarded-For` carries the real client address.
const createApp = async (
  trustProxy: string,
): Promise<NestExpressApplication> => {
  process.env.TRUST_PROXY = trustProxy;
  process.env.THROTTLE_LIMIT = String(THROTTLE_LIMIT);

  return createTestApp({
    imports: [
      CoreConfigModule,
      CoreI18nModule,
      CoreHttpModule,
      TestAuditModule,
      CoreThrottlerModule,
    ],
    controllers: [ClientIpController],
  });
};

const callAs = (app: NestExpressApplication, forwardedFor: string) =>
  request(app.getHttpServer())
    .get('/api/client-ip')
    .set('X-Forwarded-For', forwardedFor);

const auditedIps = (): unknown[] => records.map((record) => record.context?.ip);

describe('Trust proxy client IP resolution (e2e)', () => {
  const originalTrustProxy = process.env.TRUST_PROXY;
  const originalThrottleLimit = process.env.THROTTLE_LIMIT;

  let app: NestExpressApplication;

  beforeEach(() => {
    records.length = 0;
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(() => {
    process.env.TRUST_PROXY = originalTrustProxy;
    process.env.THROTTLE_LIMIT = originalThrottleLimit;
  });

  describe('when the proxy is trusted (TRUST_PROXY=loopback)', () => {
    beforeEach(async () => {
      app = await createApp('loopback');
    });

    it('rate-limits each forwarded client separately instead of the proxy as a whole', async () => {
      for (let i = 0; i < THROTTLE_LIMIT; i++) {
        await callAs(app, CLIENT_A).expect(200);
      }

      await callAs(app, CLIENT_A).expect(429);
      await callAs(app, CLIENT_B).expect(200);
    });

    it('records the forwarded client IP in the audit log', async () => {
      await callAs(app, CLIENT_A).expect(200);
      await callAs(app, CLIENT_B).expect(200);

      await wait(50);

      expect(auditedIps()).toEqual([CLIENT_A, CLIENT_B]);
    });

    it('ignores addresses a client prepends to X-Forwarded-For', async () => {
      for (let i = 0; i < THROTTLE_LIMIT; i++) {
        await callAs(app, `10.9.9.${i}, ${CLIENT_A}`).expect(200);
      }

      await callAs(app, `10.9.9.99, ${CLIENT_A}`).expect(429);

      await wait(50);

      expect(auditedIps()).toEqual(
        Array.from({ length: THROTTLE_LIMIT + 1 }, () => CLIENT_A),
      );
    });
  });

  describe('when the proxy is trusted by hop count (TRUST_PROXY=1)', () => {
    beforeEach(async () => {
      app = await createApp('1');
    });

    it('resolves the address appended by the nearest proxy, ignoring client-prepended ones', async () => {
      await callAs(app, `10.9.9.9, ${CLIENT_A}`).expect(200);

      await wait(50);

      expect(auditedIps()).toEqual([CLIENT_A]);
    });
  });

  describe('when the trusted proxy list excludes the peer (TRUST_PROXY=10.0.0.0/8)', () => {
    beforeEach(async () => {
      app = await createApp('10.0.0.0/8');
    });

    it('ignores X-Forwarded-For sent by an unlisted peer', async () => {
      await callAs(app, CLIENT_A).expect(200);

      await wait(50);

      expect(auditedIps()).toEqual([LOOPBACK_PEER]);
    });
  });

  describe('when the proxy is not trusted (TRUST_PROXY=false)', () => {
    beforeEach(async () => {
      app = await createApp('false');
    });

    it('collapses every forwarded client into the proxy address', async () => {
      for (let i = 0; i < THROTTLE_LIMIT; i++) {
        await callAs(app, CLIENT_A).expect(200);
      }

      await callAs(app, CLIENT_B).expect(429);

      await wait(50);

      expect(auditedIps()).toEqual(
        Array.from({ length: THROTTLE_LIMIT + 1 }, () => LOOPBACK_PEER),
      );
    });
  });
});
