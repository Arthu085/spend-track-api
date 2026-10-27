import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from '@core/bootstrap';
import { AppConfigService } from '@core/config';
import { setupSwagger } from '@core/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const config = app.get(AppConfigService);

  configureApp(app, config);

  setupSwagger(app);

  await app.listen(config.app.port);
}
void bootstrap();
