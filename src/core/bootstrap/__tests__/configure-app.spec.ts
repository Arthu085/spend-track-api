import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppConfigService } from '@core/config';
import { AllExceptionsFilter } from '@shared/presentation/filters';
import { I18nValidationExceptionFilter, I18nValidationPipe } from 'nestjs-i18n';
import { configureApp } from '../configure-app';

describe('configureApp', () => {
  const config = {
    app: { trustProxy: ['loopback'] },
    cookie: { secret: 'cookie-secret' },
    cors: { origins: ['http://localhost:5173'] },
  } as unknown as AppConfigService;

  const createApp = () => {
    const filter = Object.create(
      AllExceptionsFilter.prototype,
    ) as AllExceptionsFilter;

    return {
      get: jest.fn((token: unknown) => {
        if (token === AppConfigService) {
          return config;
        }

        return token === AllExceptionsFilter ? filter : undefined;
      }),
      set: jest.fn(),
      setGlobalPrefix: jest.fn(),
      use: jest.fn(),
      enableCors: jest.fn(),
      useGlobalFilters: jest.fn(),
      useGlobalPipes: jest.fn(),
    };
  };

  const configure = () => {
    const app = createApp();

    configureApp(app as unknown as NestExpressApplication, config);

    return app;
  };

  it('applies the configured trust proxy setting', () => {
    const app = configure();

    expect(app.set).toHaveBeenCalledWith('trust proxy', ['loopback']);
  });

  it('serves every route under the /api prefix', () => {
    const app = configure();

    expect(app.setGlobalPrefix).toHaveBeenCalledWith('api');
  });

  it('registers helmet and the signed cookie parser as middleware', () => {
    const app = configure();

    expect(app.use).toHaveBeenCalledTimes(2);
    expect(app.use).toHaveBeenNthCalledWith(1, expect.any(Function));
    expect(app.use).toHaveBeenNthCalledWith(2, expect.any(Function));
  });

  it('enables credentialed CORS for the configured origins only, exposing the CSRF token header', () => {
    const app = configure();

    expect(app.enableCors).toHaveBeenCalledWith({
      origin: ['http://localhost:5173'],
      credentials: true,
      exposedHeaders: ['x-csrf-token'],
    });
  });

  it('registers the global validation pipe', () => {
    const app = configure();

    expect(app.useGlobalPipes).toHaveBeenCalledWith(
      expect.any(I18nValidationPipe),
    );
  });

  // Nest checks global filters in reverse registration order, so the
  // catch-all must be registered first for validation errors to reach the
  // i18n validation filter.
  it('registers the catch-all filter before the validation filter', () => {
    const app = configure();

    expect(app.useGlobalFilters).toHaveBeenCalledTimes(2);
    expect(app.useGlobalFilters).toHaveBeenNthCalledWith(
      1,
      expect.any(AllExceptionsFilter),
    );
    expect(app.useGlobalFilters).toHaveBeenNthCalledWith(
      2,
      expect.any(I18nValidationExceptionFilter),
    );
  });
});
