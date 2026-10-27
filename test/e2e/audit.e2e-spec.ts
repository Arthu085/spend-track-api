import 'reflect-metadata';
import {
  Body,
  CanActivate,
  Controller,
  ForbiddenException,
  Global,
  Injectable,
  INestApplication,
  Module,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { IsNotEmpty, IsString } from 'class-validator';
import request from 'supertest';
import { App } from 'supertest/types';
import { CoreConfigModule } from '@core/config';
import { CoreHttpModule } from '@core/http';
import { CoreI18nModule } from '@core/i18n';
import { CoreLoggingModule } from '@core/logging';
import { AuditContextGuard } from '@modules/audit/presentation/guards/audit-context.guard';
import { AuditInterceptor } from '@modules/audit/presentation/interceptors/audit.interceptor';
import {
  AUDIT_LOG_PORT,
  AuditOutcome,
  endpoint,
  NotFoundError,
  type AuditLogPort,
  type AuditRecordInput,
} from '@shared/index';
import { createTestApp } from './helpers/create-test-app';

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

class CreateThingDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

@Injectable()
class DeniedGuard implements CanActivate {
  canActivate(): boolean {
    throw new ForbiddenException('access denied');
  }
}

const records: AuditRecordInput[] = [];

const recordMock = jest.fn((input: AuditRecordInput): Promise<void> => {
  records.push(input);
  return Promise.resolve();
});

const auditLogSpy: AuditLogPort = { record: recordMock };

// Mirrors the real `AuditModule`: the port is bound in a `@Global()` module so
// `AllExceptionsFilter` can resolve it via `@Optional()` without an import cycle.
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
class AuditE2eController {
  @(endpoint().get('audited-success').audit('Thing.read').build())
  auditedSuccess(): { id: string } {
    return { id: 'thing-1' };
  }

  @(endpoint().get('audited-not-found').audit('Thing.read').build())
  auditedNotFound(): never {
    throw new NotFoundError();
  }

  @(endpoint().post('audited-validated').audit('Thing.create').build())
  auditedValidated(@Body() dto: CreateThingDto): { name: string } {
    return { name: dto.name };
  }

  @(endpoint()
    .delete('audited-denied')
    .audit('Thing.delete')
    .guards(DeniedGuard)
    .build())
  auditedDenied(): never {
    throw new Error('handler must never run for a denied request');
  }

  @(endpoint().get('unaudited').build())
  unaudited(): { id: string } {
    return { id: 'thing-2' };
  }

  @(endpoint().get('audited-crash').audit('Thing.read').build())
  auditedCrash(): never {
    throw new Error('db down');
  }

  @(endpoint().get('unaudited-crash').build())
  unauditedCrash(): never {
    throw new Error('db down');
  }
}

describe('Audit module (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    records.length = 0;
    recordMock.mockClear();

    // Deliberately does not import the real `AuditModule` — this spec proves
    // the guard/interceptor/filter wiring against an in-memory `AUDIT_LOG_PORT`
    // spy, no real Postgres needed.
    app = await createTestApp({
      imports: [
        CoreConfigModule,
        CoreI18nModule,
        CoreHttpModule,
        CoreLoggingModule,
        TestAuditModule,
      ],
      controllers: [AuditE2eController],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('persists exactly one SUCCESS record with the real status code and the annotated action', async () => {
    await request(app.getHttpServer()).get('/api/audited-success').expect(200);

    await wait(50);

    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(
      expect.objectContaining({
        action: 'Thing.read',
        method: 'GET',
        path: '/api/audited-success',
        outcome: AuditOutcome.SUCCESS,
        statusCode: 200,
      }),
    );
  });

  it('persists exactly one FAILURE record for a thrown DomainError, mapped to its HTTP status', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/audited-not-found')
      .expect(404);

    const body = response.body as {
      statusCode: number;
      error: string;
      message: string;
      path: string;
    };

    expect(body.statusCode).toBe(404);
    expect(body.path).toBe('/api/audited-not-found');

    await wait(50);

    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(
      expect.objectContaining({
        action: 'Thing.read',
        outcome: AuditOutcome.FAILURE,
        statusCode: 404,
      }),
    );
  });

  it('persists exactly one record for a DTO validation failure (proves the finish-deferred design)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/audited-validated')
      .send({})
      .expect(400);

    const body = response.body as { statusCode: number; message: unknown };

    // Validation errors are handled entirely by `I18nValidationExceptionFilter`,
    // never by `AllExceptionsFilter` — the flattened shape below is the proof.
    expect(Array.isArray(body.message)).toBe(true);
    expect(body).not.toHaveProperty('timestamp');

    await wait(50);

    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(
      expect.objectContaining({
        action: 'Thing.create',
        outcome: AuditOutcome.FAILURE,
        statusCode: 400,
      }),
    );
  });

  it('persists exactly one record for a guard-level rejection, emitted by the exception filter', async () => {
    const response = await request(app.getHttpServer())
      .delete('/api/audited-denied')
      .set('x-request-id', 'denied-request-id')
      .expect(403);

    const body = response.body as Record<string, unknown>;

    expect('auditId' in body).toBe(false);

    await wait(50);

    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(
      expect.objectContaining({
        action: 'Thing.delete',
        outcome: AuditOutcome.FAILURE,
        statusCode: 403,
        context: expect.objectContaining({
          requestId: 'denied-request-id',
        }) as unknown,
      }),
    );
  });

  it('persists no record for an un-annotated route (opt-in proof)', async () => {
    await request(app.getHttpServer()).get('/api/unaudited').expect(200);

    await wait(50);

    expect(records).toHaveLength(0);
  });

  it('surfaces a matching auditId for a raw internal error on an audited route, and persists it under the same uuid', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/audited-crash')
      .expect(500);

    const body = response.body as { auditId?: string; message: string };

    expect(typeof body.auditId).toBe('string');
    expect(body.auditId).toMatch(/^[0-9a-f-]{36}$/i);

    await wait(50);

    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(
      expect.objectContaining({
        uuid: body.auditId,
        action: 'Thing.read',
        outcome: AuditOutcome.FAILURE,
        statusCode: 500,
      }),
    );
  });

  it('never surfaces an auditId for a raw internal error on an unaudited route, and persists no record', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/unaudited-crash')
      .expect(500);

    const body = response.body as Record<string, unknown>;

    expect('auditId' in body).toBe(false);

    await wait(50);

    expect(records).toHaveLength(0);
  });

  describe('query string exclusion', () => {
    const SENSITIVE_QUERY =
      'email=user%40example.com&token=super-secret-query-token';

    const expectNoQueryPersisted = (): void => {
      const serialized = JSON.stringify(records);

      expect(records.map((record) => record.path)).not.toContainEqual(
        expect.stringContaining('?'),
      );
      expect(serialized).not.toContain('user%40example.com');
      expect(serialized).not.toContain('user@example.com');
      expect(serialized).not.toContain('super-secret-query-token');
    };

    it('persists the bare path for a successful request', async () => {
      await request(app.getHttpServer())
        .get(`/api/audited-success?${SENSITIVE_QUERY}`)
        .expect(200);

      await wait(50);

      expect(records).toHaveLength(1);
      expect(records[0]).toEqual(
        expect.objectContaining({
          path: '/api/audited-success',
          outcome: AuditOutcome.SUCCESS,
        }),
      );
      expectNoQueryPersisted();
    });

    it('persists the bare path for a failed request', async () => {
      await request(app.getHttpServer())
        .get(`/api/audited-not-found?${SENSITIVE_QUERY}`)
        .expect(404);

      await wait(50);

      expect(records).toHaveLength(1);
      expect(records[0]).toEqual(
        expect.objectContaining({
          path: '/api/audited-not-found',
          outcome: AuditOutcome.FAILURE,
          statusCode: 404,
        }),
      );
      expectNoQueryPersisted();
    });

    it('persists the bare path for a request rejected by the validation exception filter', async () => {
      await request(app.getHttpServer())
        .post(`/api/audited-validated?${SENSITIVE_QUERY}`)
        .send({})
        .expect(400);

      await wait(50);

      expect(records).toHaveLength(1);
      expect(records[0]).toEqual(
        expect.objectContaining({
          path: '/api/audited-validated',
          outcome: AuditOutcome.FAILURE,
          statusCode: 400,
        }),
      );
      expectNoQueryPersisted();
    });

    it('persists the bare path and keeps the request id for a guard-level rejection', async () => {
      await request(app.getHttpServer())
        .delete(`/api/audited-denied?${SENSITIVE_QUERY}`)
        .set('x-request-id', 'denied-request-id')
        .expect(403);

      await wait(50);

      expect(records).toHaveLength(1);
      expect(records[0]).toEqual(
        expect.objectContaining({
          path: '/api/audited-denied',
          outcome: AuditOutcome.FAILURE,
          statusCode: 403,
          context: expect.objectContaining({
            requestId: 'denied-request-id',
          }) as unknown,
        }),
      );
      expectNoQueryPersisted();
    });

    it('persists the bare path for an unexpected error on an audited route', async () => {
      await request(app.getHttpServer())
        .get(`/api/audited-crash?${SENSITIVE_QUERY}`)
        .expect(500);

      await wait(50);

      expect(records).toHaveLength(1);
      expect(records[0]).toEqual(
        expect.objectContaining({
          path: '/api/audited-crash',
          statusCode: 500,
        }),
      );
      expectNoQueryPersisted();
    });
  });

  // Request bodies are never captured, so no secret from the body or the
  // request headers can ever reach a persisted record.
  it('never persists a Cookie/Authorization header value or a password field', async () => {
    await request(app.getHttpServer())
      .post('/api/audited-validated')
      .set('Cookie', 'access_token=super-secret-cookie-value')
      .set('Authorization', 'Bearer super-secret-token-value')
      .send({ name: 'a thing', password: 'super-secret-password-value' })
      .expect(201);

    await wait(50);

    expect(records).toHaveLength(1);

    const serialized = JSON.stringify(records);

    expect(serialized).not.toContain('super-secret-cookie-value');
    expect(serialized).not.toContain('super-secret-token-value');
    expect(serialized).not.toContain('super-secret-password-value');
    expect(serialized).not.toContain('password');
  });
});
