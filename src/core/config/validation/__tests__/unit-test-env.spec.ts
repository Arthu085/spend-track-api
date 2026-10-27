import {
  APP_ENV_KEYS,
  UNIT_TEST_ENV,
  applyUnitTestEnv,
} from '@test/unit/unit-test-env';
import { validationSchema } from '../env.validation';

// Guards `test/unit/setup-env.ts`: unit tests must not depend on whatever a
// developer exported in their shell or loaded from a local `.env`.
describe('unit test environment', () => {
  it('overrides developer values for required variables', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'development',
      DB_HOST: 'db.internal',
      JWT_ACCESS_SECRET: 'real-access-secret',
      COOKIE_SECRET: 'real-cookie-secret',
      SEED_ADMIN_PASSWORD: 'real-admin-password',
    };

    applyUnitTestEnv(env);

    expect(env).toEqual(UNIT_TEST_ENV);
  });

  it('removes optional app variables and keeps unrelated ones', () => {
    const env: NodeJS.ProcessEnv = {
      LOG_LEVEL: 'debug',
      COOKIE_SECURE: 'true',
      MAIL_TRANSPORT: 'smtp',
      PATH: '/usr/bin',
    };

    applyUnitTestEnv(env);

    expect(env).toEqual({ ...UNIT_TEST_ENV, PATH: '/usr/bin' });
  });

  it('exposes only the fixed values to unit test files', () => {
    const appEnv = Object.fromEntries(
      APP_ENV_KEYS.filter((key) => process.env[key] !== undefined).map(
        (key) => [key, process.env[key]],
      ),
    );

    expect(appEnv).toEqual(UNIT_TEST_ENV);
  });

  it('satisfies the app validation schema', () => {
    expect(validationSchema.validate(UNIT_TEST_ENV).error).toBeUndefined();
  });
});
