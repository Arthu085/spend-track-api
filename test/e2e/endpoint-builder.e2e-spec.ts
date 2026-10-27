import 'reflect-metadata';
import { Body, Controller, HttpStatus, INestApplication } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import request from 'supertest';
import { App } from 'supertest/types';
import { CoreConfigModule } from '@core/config';
import { CoreHttpModule } from '@core/http';
import { CoreI18nModule } from '@core/i18n';
import {
  ABILITY_METADATA_KEY,
  Action,
  AUDIT_METADATA_KEY,
  endpoint,
  Subject,
} from '@shared/index';
import { createTestApp } from './helpers/create-test-app';

interface EnvelopeBody<T> {
  data: T;
  meta: Record<string, unknown>;
}

interface FlattenedValidationErrorBody {
  statusCode: number;
  message: unknown;
  error: unknown;
}

class ExampleItemDto {
  id!: string;
}

class CreateExampleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

interface CreateExampleResult {
  name: string;
}

@Controller()
class ExampleController {
  @(endpoint()
    .get('example')
    .summary('Returns an example item')
    .response(ExampleItemDto, HttpStatus.OK)
    .ability({ action: Action.READ, subject: Subject.USER })
    .audit('Example.read')
    .build())
  findOne(): ExampleItemDto {
    return { id: 'example-id' };
  }

  @(endpoint()
    .post('example')
    .body(CreateExampleDto)
    .httpCode(HttpStatus.CREATED)
    .build())
  create(@Body() dto: CreateExampleDto): CreateExampleResult {
    return { name: dto.name };
  }
}

describe('Endpoint builder (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // Deliberately does not import `DatabaseModule` — this spec exercises the
    // builder-produced routes through the real envelope/validation pipeline,
    // no real Postgres needed.
    app = await createTestApp({
      imports: [CoreConfigModule, CoreI18nModule, CoreHttpModule],
      controllers: [ExampleController],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns a 200 response wrapped in the { data, meta } envelope for the GET route', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/example')
      .expect(200);

    const body = response.body as EnvelopeBody<ExampleItemDto>;

    expect(body).toEqual({ data: { id: 'example-id' }, meta: {} });
  });

  it('returns a 201 enveloped response for a valid POST body', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/example')
      .send({ name: 'a valid name' })
      .expect(201);

    const body = response.body as EnvelopeBody<CreateExampleResult>;

    expect(body).toEqual({ data: { name: 'a valid name' }, meta: {} });
  });

  it('returns the flattened validation error shape for an invalid POST body', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/example')
      .send({})
      .expect(400);

    const body = response.body as FlattenedValidationErrorBody;

    expect(body.statusCode).toBe(400);
    expect(Array.isArray(body.message)).toBe(true);

    const messages = body.message as unknown[];

    expect(messages.length).toBeGreaterThan(0);

    for (const message of messages) {
      expect(typeof message).toBe('string');
      expect((message as string).length).toBeGreaterThan(0);
    }
  });

  it('survives real Nest bootstrapping with .ability()/.audit() metadata intact', () => {
    // Untyped record avoids @typescript-eslint/unbound-method when reading handler
    // references for Reflect.getMetadata.
    const findOneHandler = (
      ExampleController.prototype as unknown as Record<string, object>
    ).findOne;

    expect(Reflect.getMetadata(ABILITY_METADATA_KEY, findOneHandler)).toEqual([
      { action: Action.READ, subject: Subject.USER },
    ]);

    expect(Reflect.getMetadata(AUDIT_METADATA_KEY, findOneHandler)).toBe(
      'Example.read',
    );
  });
});
