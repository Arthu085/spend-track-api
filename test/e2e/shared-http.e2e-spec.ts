import { Controller, Get, INestApplication, Query } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { CoreConfigModule } from '@core/config';
import { CoreHttpModule } from '@core/http';
import { CoreI18nModule } from '@core/i18n';
import { PaginatedResult } from '@shared/application/dto';
import { NotFoundError } from '@shared/domain/errors';
import { PaginationQueryDto } from '@shared/presentation/dto';
import { createTestApp } from './helpers/create-test-app';

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
}

interface FlattenedValidationErrorBody {
  statusCode: number;
  message: unknown;
  error: unknown;
}

@Controller('probe')
class ProbeController {
  @Get('object')
  getObject(): { foo: string } {
    return { foo: 'bar' };
  }

  @Get('paginated')
  getPaginated(): PaginatedResult<string> {
    return PaginatedResult.of(['a', 'b'], 2, 1, 20);
  }

  @Get('not-found')
  getNotFound(): never {
    throw new NotFoundError();
  }

  @Get('validated')
  getValidated(@Query() query: PaginationQueryDto): {
    page: number;
    limit: number;
    offset: number;
  } {
    return { page: query.page, limit: query.limit, offset: query.offset };
  }
}

describe('Shared HTTP building blocks (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // Deliberately does not import `DatabaseModule` — these specs exercise the
    // response envelope / exception handling wiring only, no real Postgres needed.
    app = await createTestApp({
      imports: [CoreConfigModule, CoreI18nModule, CoreHttpModule],
      controllers: [ProbeController],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('wraps a plain object response in the { data, meta } envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/object')
      .expect(200);

    const body = response.body as EnvelopeBody<{ foo: string }>;

    expect(body).toEqual({ data: { foo: 'bar' }, meta: {} });
  });

  it('unpacks a PaginatedResult into data (items) and meta (pagination info)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/paginated')
      .expect(200);

    const body = response.body as EnvelopeBody<string[]>;

    expect(body).toEqual({
      data: ['a', 'b'],
      meta: { total: 2, page: 1, limit: 20 },
    });
  });

  it('maps a thrown NotFoundError to a 404 with the standard error shape, localized to pt-BR by default', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/not-found')
      .expect(404);

    const body = response.body as ErrorBody;

    expect(body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Recurso não encontrado',
      timestamp: expect.any(String) as string,
      path: '/api/probe/not-found',
    });
  });

  it('localizes the NotFoundError message to English via the x-lang header', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/not-found')
      .set('x-lang', 'en')
      .expect(404);

    const body = response.body as ErrorBody;

    expect(body.statusCode).toBe(404);
    expect(body.message).toBe('Resource not found');
  });

  it('localizes the 404 for an unmatched route instead of echoing the method and path', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/nope')
      .expect(404);

    const body = response.body as ErrorBody;

    expect(body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Rota não encontrada',
      timestamp: expect.any(String) as string,
      path: '/api/nope',
    });
  });

  it('localizes the unmatched-route 404 to English via the x-lang header', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/nope')
      .set('x-lang', 'en')
      .expect(404);

    const body = response.body as ErrorBody;

    expect(body.message).toBe('Route not found');
  });

  it('keeps the dedicated I18nValidationExceptionFilter shape for query DTO validation failures', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/validated')
      .query({ page: 0, limit: 500 })
      .expect(400);

    const body = response.body as FlattenedValidationErrorBody;

    // Validation errors must never fall through to the generic catch-all
    // shape (`{statusCode,error,message,timestamp,path}` with a string
    // `message`); they keep their flattened shape with a `message` array.
    expect(body.statusCode).toBe(400);
    expect(Array.isArray(body.message)).toBe(true);
    expect(body).not.toHaveProperty('timestamp');
    expect(body).not.toHaveProperty('path');
  });

  it('accepts a valid paginated query and returns the coerced values through the envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/probe/validated')
      .query({ page: 2, limit: 10 })
      .expect(200);

    const body = response.body as EnvelopeBody<{
      page: number;
      limit: number;
      offset: number;
    }>;

    expect(body).toEqual({
      data: { page: 2, limit: 10, offset: 10 },
      meta: {},
    });
  });
});
