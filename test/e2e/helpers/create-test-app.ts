import type { ModuleMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { configureApp } from '@core/bootstrap';
import { AppConfigService } from '@core/config';
import { AppModule } from '../../../src/app.module';

export interface CreateTestAppOptions {
  imports?: ModuleMetadata['imports'];
  controllers?: ModuleMetadata['controllers'];
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

// Applies the production `configureApp` pipeline, so requests must carry the
// `/api` global prefix exactly as they would against `main.ts`.
export async function createTestApp({
  imports = [AppModule],
  controllers = [],
  override = (builder) => builder,
}: CreateTestAppOptions = {}): Promise<NestExpressApplication> {
  const moduleFixture = await override(
    Test.createTestingModule({ imports, controllers }),
  ).compile();

  const app = moduleFixture.createNestApplication<NestExpressApplication>();

  configureApp(app, app.get(AppConfigService));

  await app.init();

  return app;
}
