import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { getCorsConfig } from './core/config/network/cors.config';
import cookieParser from 'cookie-parser';
import { setupSwagger } from './core/config/swagger/swagger.setup';
import { ConfigService } from '@nestjs/config';
import { EnvOptions } from './core/config/env/types/env.types';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const env = configService.get<EnvOptions>('env')!;

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.enableCors(getCorsConfig(env));
  app.use(cookieParser());
  setupSwagger(app);

  await app.listen(env.PORT);
}
void bootstrap();
