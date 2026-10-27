import 'reflect-metadata';
import { Controller, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { CoreConfigModule } from '@core/config';
import { CoreHttpModule } from '@core/http';
import { CoreI18nModule } from '@core/i18n';
import { endpoint, PaginatedResult } from '@shared/index';
import { createTestApp } from './helpers/create-test-app';

// Exact strings from `src/i18n/{pt-BR,en}/success.json` — asserted literally
// (rather than importing the JSON, which the project's tsconfig does not
// enable via `resolveJsonModule`) to prove real translation, not a stub.
const PT_BR_SUCCESS = {
  created: 'Criado com sucesso',
  ok: 'Operação realizada com sucesso',
};

const EN_SUCCESS = {
  created: 'Successfully created',
  ok: 'Operation completed successfully',
};

interface EnvelopeBody<T> {
  data: T;
  meta: Record<string, unknown>;
}

interface ExampleItem {
  id: string;
}

@Controller()
class SuccessMessageController {
  @(endpoint().get('with-message').successMessage('success.created').build())
  withMessage(): ExampleItem {
    return { id: 'example-id' };
  }

  @(endpoint().get('paginated').successMessage('success.ok').build())
  paginated(): PaginatedResult<ExampleItem> {
    return PaginatedResult.of([{ id: 'example-id' }], 1, 1, 20);
  }

  @(endpoint().get('without-message').build())
  withoutMessage(): ExampleItem {
    return { id: 'example-id' };
  }

  @(endpoint()
    .get('unknown-key')
    .successMessage('success.nonexistent_key')
    .build())
  unknownKey(): ExampleItem {
    return { id: 'example-id' };
  }
}

describe('Success message envelope (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp({
      imports: [CoreConfigModule, CoreI18nModule, CoreHttpModule],
      controllers: [SuccessMessageController],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('sets meta.message to the pt-BR translation by default', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/with-message')
      .expect(200);

    const body = response.body as EnvelopeBody<ExampleItem>;

    expect(body.data).toEqual({ id: 'example-id' });
    expect(body.meta.message).toBe(PT_BR_SUCCESS.created);
  });

  it('sets meta.message to the en translation when x-lang: en is sent', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/with-message')
      .set('x-lang', 'en')
      .expect(200);

    const body = response.body as EnvelopeBody<ExampleItem>;

    expect(body.data).toEqual({ id: 'example-id' });
    expect(body.meta.message).toBe(EN_SUCCESS.created);
  });

  it('includes total/page/limit alongside message for a PaginatedResult', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/paginated')
      .expect(200);

    const body = response.body as EnvelopeBody<ExampleItem[]>;

    expect(body.data).toEqual([{ id: 'example-id' }]);
    expect(body.meta).toEqual({
      total: 1,
      page: 1,
      limit: 20,
      message: PT_BR_SUCCESS.ok,
    });
  });

  it('has no meta.message when .successMessage() was never called', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/without-message')
      .expect(200);

    const body = response.body as EnvelopeBody<ExampleItem>;

    expect(body.data).toEqual({ id: 'example-id' });
    expect(body.meta).toEqual({});
    expect(Object.keys(body.meta)).not.toContain('message');
  });

  it('omits meta.message and still returns 200 with intact data for an unresolvable key', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/unknown-key')
      .expect(200);

    const body = response.body as EnvelopeBody<ExampleItem>;

    expect(body.data).toEqual({ id: 'example-id' });
    expect(body.meta).toEqual({});
    expect(Object.keys(body.meta)).not.toContain('message');
  });
});
