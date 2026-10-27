import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { AppConfigService } from '@core/config';
import { setupExceptionHandling, setupTrustProxy } from '@core/http';
import { setupValidation } from '@core/validation';
import { CSRF_HEADER_NAME } from '@shared/presentation/http';

const GLOBAL_PREFIX = 'api';

export function configureApp(
  app: NestExpressApplication,
  config: AppConfigService,
): void {
  setupTrustProxy(app);

  app.setGlobalPrefix(GLOBAL_PREFIX);

  app.use(helmet());

  app.use(cookieParser(config.cookie.secret));

  app.enableCors({
    origin: config.cors.origins,
    credentials: true,
    exposedHeaders: [CSRF_HEADER_NAME],
  });

  setupExceptionHandling(app);

  setupValidation(app);
}
