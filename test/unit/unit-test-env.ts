import { validationSchema } from '@core/config/validation/env.validation';

export const UNIT_TEST_ENV = {
  NODE_ENV: 'test',

  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USER: 'postgres',
  DB_PASSWORD: 'postgres',
  DB_NAME: 'app',

  JWT_ACCESS_SECRET: 'unit-test-access-secret',
  JWT_REFRESH_SECRET: 'unit-test-refresh-secret',
  COOKIE_SECRET: 'unit-test-cookie-secret',

  SEED_ADMIN_EMAIL: 'seed-admin@example.com',
  SEED_ADMIN_PASSWORD: 'Unit-test-password1',
} as const satisfies NodeJS.ProcessEnv;

const { keys: appEnvSchemaKeys } = validationSchema.describe() as {
  keys: Record<string, unknown>;
};

export const APP_ENV_KEYS = Object.keys(appEnvSchemaKeys);

export function applyUnitTestEnv(env: NodeJS.ProcessEnv): void {
  for (const key of APP_ENV_KEYS) {
    delete env[key];
  }

  Object.assign(env, UNIT_TEST_ENV);
}
