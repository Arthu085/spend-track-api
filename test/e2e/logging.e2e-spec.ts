import { Controller, Get, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { CoreConfigModule } from '@core/config';
import { CoreHttpModule } from '@core/http';
import { CoreI18nModule } from '@core/i18n';
import { CoreLoggingModule } from '@core/logging';
import { createTestApp } from './helpers/create-test-app';

@Controller('probe')
class ProbeController {
  @Get('ping')
  getPing(): { pong: boolean } {
    return { pong: true };
  }
}

describe('Pino request logging (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // Deliberately does not import `DatabaseModule` — these specs exercise the
    // Pino HTTP middleware wiring only, no real Postgres needed. Log line
    // content/redaction is not asserted here (brittle to spy on stdout); it is
    // covered deterministically by `pino-options.factory.redaction.spec.ts`.
    app = await createTestApp({
      imports: [
        CoreConfigModule,
        CoreI18nModule,
        CoreHttpModule,
        CoreLoggingModule,
      ],
      controllers: [ProbeController],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('does not break the request pipeline', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/ping')
      .expect(200);

    expect(response.body).toEqual({ data: { pong: true }, meta: {} });
  });

  it('sets an X-Request-Id header on the response', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/ping')
      .expect(200);

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.headers['x-request-id'].length).toBeGreaterThan(0);
  });

  it('echoes back an inbound x-request-id header', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/ping')
      .set('x-request-id', 'inbound-request-id')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('inbound-request-id');
  });
});
