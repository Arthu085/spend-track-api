import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { AppConfigService } from '@core/config';
import { CSRF_TOKEN_COOKIE } from '@modules/auth/presentation';
import { CSRF_HEADER_NAME } from '@shared/presentation/http';
import { ACCESS_TOKEN_SECURITY_SCHEME, setupSwagger } from '../setup-swagger';

jest.mock('@nestjs/swagger', () => {
  const actual =
    jest.requireActual<typeof import('@nestjs/swagger')>('@nestjs/swagger');

  return {
    ...actual,
    SwaggerModule: {
      createDocument: jest.fn(() => ({ openapi: '3.0.0' })),
      setup: jest.fn(),
    },
  };
});

describe('setupSwagger', () => {
  const createApp = (nodeEnv: string) => {
    const config = { app: { nodeEnv } } as unknown as AppConfigService;

    return {
      get: jest.fn((token: unknown) =>
        token === AppConfigService ? config : undefined,
      ),
    } as unknown as INestApplication;
  };

  const swagger = jest.mocked(SwaggerModule);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  type InterceptedRequest = {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    credentials?: string;
  };

  const getRequestInterceptor = () => {
    setupSwagger(createApp('development'));

    const [, , , customOptions] = swagger.setup.mock.calls[0];

    return customOptions?.swaggerOptions?.requestInterceptor as (
      req: InterceptedRequest,
    ) => InterceptedRequest;
  };

  const csrfHeaderOf = (req: InterceptedRequest) =>
    Object.entries(req.headers ?? {}).find(
      ([name]) => name.toLowerCase() === CSRF_HEADER_NAME,
    )?.[1];

  it('serves the documentation at /api/docs outside production', () => {
    const app = createApp('development');

    setupSwagger(app);

    expect(swagger.createDocument).toHaveBeenCalledTimes(1);
    expect(swagger.setup).toHaveBeenCalledTimes(1);

    const [path, setupApp, document] = swagger.setup.mock.calls[0];

    expect(path).toBe('docs');
    expect(setupApp).toBe(app);
    expect(document).toEqual({ openapi: '3.0.0' });
    expect(swagger.setup.mock.calls[0][3]?.useGlobalPrefix).toBe(true);
  });

  describe('"Try it out" request interceptor', () => {
    const token = 'a'.repeat(64) + '.' + 'b'.repeat(64);

    // Jest runs in Node, so stub the browser globals Swagger UI provides.
    const stubBrowser = (cookie: string) => {
      Object.assign(globalThis, {
        window: {
          location: {
            href: 'http://localhost:3000/api/docs',
            origin: 'http://localhost:3000',
          },
        },
        document: { cookie },
      });
    };

    afterEach(() => {
      Reflect.deleteProperty(globalThis, 'window');
      Reflect.deleteProperty(globalThis, 'document');
    });

    it('sends credentials so cookie auth works', () => {
      stubBrowser('');
      const req: InterceptedRequest = { url: '/api/auth/csrf' };

      expect(getRequestInterceptor()(req)).toBe(req);
      expect(req.credentials).toBe('include');
    });

    it('copies the CSRF cookie into the CSRF header on same-origin unsafe requests', () => {
      stubBrowser(`theme=dark; ${CSRF_TOKEN_COOKIE}=${token}`);

      const req: InterceptedRequest = {
        url: 'http://localhost:3000/api/auth/login',
        method: 'post',
        headers: { 'Content-Type': 'application/json' },
      };

      getRequestInterceptor()(req);

      expect(csrfHeaderOf(req)).toBe(token);
      expect(req.headers?.['Content-Type']).toBe('application/json');
    });

    it.each(['GET', 'HEAD', 'OPTIONS', undefined])(
      'skips the CSRF header for safe method %s',
      (method) => {
        stubBrowser(`${CSRF_TOKEN_COOKIE}=${token}`);
        const req: InterceptedRequest = { url: '/api/users', method };

        getRequestInterceptor()(req);

        expect(csrfHeaderOf(req)).toBeUndefined();
      },
    );

    it('never sends the CSRF token to another origin', () => {
      stubBrowser(`${CSRF_TOKEN_COOKIE}=${token}`);

      const req: InterceptedRequest = {
        url: 'https://example.com/api/auth/login',
        method: 'POST',
      };

      getRequestInterceptor()(req);

      expect(csrfHeaderOf(req)).toBeUndefined();
    });

    it('leaves the header unset when no CSRF cookie is readable', () => {
      stubBrowser('theme=dark');

      const req: InterceptedRequest = {
        url: '/api/auth/login',
        method: 'POST',
      };

      getRequestInterceptor()(req);

      expect(csrfHeaderOf(req)).toBeUndefined();
    });
  });

  it('takes the documentation version and description from package.json', () => {
    const { version, description } = JSON.parse(
      readFileSync(resolve(__dirname, '../../../../package.json'), 'utf8'),
    ) as { version: string; description: string };

    setupSwagger(createApp('development'));

    const [, documentConfig] = swagger.createDocument.mock.calls[0];

    expect(documentConfig.info.version).toBe(version);
    expect(documentConfig.info.description).toBe(description);
  });

  it('documents the access token cookie as the auth scheme', () => {
    const app = createApp('development');

    setupSwagger(app);

    const [, documentConfig] = swagger.createDocument.mock.calls[0];

    expect(documentConfig.info.title).toBe('API');
    expect(
      documentConfig.components?.securitySchemes?.[
        ACCESS_TOKEN_SECURITY_SCHEME
      ],
    ).toEqual(
      expect.objectContaining({
        type: 'apiKey',
        in: 'cookie',
        name: 'access_token',
      }),
    );
  });

  it('disables the documentation surface in production', () => {
    const app = createApp('production');

    setupSwagger(app);

    expect(swagger.createDocument).not.toHaveBeenCalled();
    expect(swagger.setup).not.toHaveBeenCalled();
  });
});
