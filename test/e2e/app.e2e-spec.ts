import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './helpers/create-test-app';

describe('AppModule (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it('boots and has no routes defined yet', () => {
    return request(app.getHttpServer()).get('/api/').expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});
