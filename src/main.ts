import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { corsConfig } from './core/config/network/cors.config';
import cookieParser from 'cookie-parser';
import { setupSwagger } from './core/config/swagger/swagger.setup';
import { envConfig } from './core/config/env/env.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
  app.enableCors(corsConfig);
  app.use(cookieParser());
  setupSwagger(app);

  await app.listen(envConfig.PORT);
}
void bootstrap();
