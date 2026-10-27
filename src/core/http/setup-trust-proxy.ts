import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppConfigService } from '@core/config';

export function setupTrustProxy(app: NestExpressApplication): void {
  app.set('trust proxy', app.get(AppConfigService).app.trustProxy);
}
