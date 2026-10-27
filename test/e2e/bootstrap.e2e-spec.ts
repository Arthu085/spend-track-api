import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { CSRF_HEADER } from './helpers/auth-agent';
import { E2E_CORS_ORIGIN } from './helpers/cors-origin';
import { createTestApp } from './helpers/create-test-app';

const DISALLOWED_ORIGIN = 'http://disallowed.example.com';

interface ErrorBody {
  statusCode: number;
  path: string;
}

interface ValidationErrorBody {
  statusCode: number;
  message: unknown;
}

function setCookiesOf(response: request.Response): string[] {
  const raw: unknown = (response.headers as Record<string, unknown>)[
    'set-cookie'
  ];

  if (Array.isArray(raw)) {
    return raw as string[];
  }

  return typeof raw === 'string' ? [raw] : [];
}

describe('Production bootstrap (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('global prefix', () => {
    it('serves routes under /api', async () => {
      await request(app.getHttpServer()).get('/api/auth/csrf').expect(200);
    });

    it('answers unprefixed paths with the global filter 404 shape', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/csrf')
        .expect(404);

      const body = response.body as ErrorBody;

      expect(body.statusCode).toBe(404);
      expect(body.path).toBe('/auth/csrf');
    });
  });

  describe('security headers', () => {
    it.each([
      ['a successful response', '/api/auth/csrf', 200],
      ['an error response', '/api/does-not-exist', 404],
    ])('sets Helmet headers on %s', async (_label, path, status) => {
      const response = await request(app.getHttpServer())
        .get(path)
        .expect(status);

      expect(response.headers).toMatchObject({
        'content-security-policy': expect.stringContaining(
          "default-src 'self'",
        ) as string,
        'cross-origin-opener-policy': 'same-origin',
        'cross-origin-resource-policy': 'same-origin',
        'referrer-policy': 'no-referrer',
        'strict-transport-security': 'max-age=31536000; includeSubDomains',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'SAMEORIGIN',
      });
      expect(response.headers).not.toHaveProperty('x-powered-by');
    });
  });

  describe('CORS', () => {
    it('echoes an allowed origin with credentials on simple requests', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/csrf')
        .set('Origin', E2E_CORS_ORIGIN)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(
        E2E_CORS_ORIGIN,
      );
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['vary']).toContain('Origin');
    });

    it('answers preflight requests from an allowed origin', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/auth/login')
        .set('Origin', E2E_CORS_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', `content-type,${CSRF_HEADER}`)
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe(
        E2E_CORS_ORIGIN,
      );
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-allow-methods']).toContain(
        'POST',
      );
      expect(response.headers['access-control-allow-headers']).toBe(
        `content-type,${CSRF_HEADER}`,
      );
    });

    it('does not allow an origin outside CORS_ORIGINS', async () => {
      const simple = await request(app.getHttpServer())
        .get('/api/auth/csrf')
        .set('Origin', DISALLOWED_ORIGIN)
        .expect(200);

      const preflight = await request(app.getHttpServer())
        .options('/api/auth/login')
        .set('Origin', DISALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'POST');

      expect(simple.headers).not.toHaveProperty('access-control-allow-origin');
      expect(preflight.headers).not.toHaveProperty(
        'access-control-allow-origin',
      );
    });
  });

  describe('cookies and validation', () => {
    it('parses the issued CSRF cookie and rejects an invalid body through the global validation pipe', async () => {
      const csrfResponse = await request(app.getHttpServer())
        .get('/api/auth/csrf')
        .expect(200);

      const cookies = setCookiesOf(csrfResponse);

      const csrfCookie = cookies.find((entry) =>
        entry.startsWith('csrf_token='),
      );

      expect(csrfCookie).toBeDefined();

      const token = csrfCookie!.split(';')[0].split('=')[1];

      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Cookie', cookies.map((entry) => entry.split(';')[0]).join('; '))
        .set(CSRF_HEADER, token)
        .send({ email: 'not-an-email' })
        .expect(400);

      const body = response.body as ValidationErrorBody;

      expect(body.statusCode).toBe(400);
      expect(Array.isArray(body.message)).toBe(true);
    });
  });
});
