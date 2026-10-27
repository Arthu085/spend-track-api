import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { Test } from '@nestjs/testing';
import type * as ConfigModuleExports from '../config.module';
import { PRODUCTION_SECRET_MIN_LENGTH } from '../validation/env.validation';

const ENV_EXAMPLE = parseEnv(
  readFileSync(resolve(__dirname, '../../../../.env.example'), 'utf8'),
);

const INSECURE_EXAMPLE_KEYS = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'COOKIE_SECRET',
  'COOKIE_SECURE',
  'MAIL_TRANSPORT',
  'SEED_ADMIN_EMAIL',
  'SEED_ADMIN_PASSWORD',
];

const HARDENED_PRODUCTION_ENV = {
  JWT_ACCESS_SECRET: 'a'.repeat(PRODUCTION_SECRET_MIN_LENGTH),
  JWT_REFRESH_SECRET: 'r'.repeat(PRODUCTION_SECRET_MIN_LENGTH),
  COOKIE_SECRET: 'c'.repeat(PRODUCTION_SECRET_MIN_LENGTH),
  COOKIE_SECURE: 'true',
  MAIL_TRANSPORT: 'smtp',
  MAIL_HOST: 'smtp.example.com',
  MAIL_FROM: 'no-reply@example.com',
  SEED_ADMIN_EMAIL: 'ops@example.com',
  SEED_ADMIN_PASSWORD: 'A-strong-seed-password1',
};

// `ConfigModule.forRoot` validates the environment when `config.module.ts` is
// first evaluated, so each boot needs a fresh module registry to see the
// environment the test sets.
const bootCoreConfigModule = (env: NodeJS.ProcessEnv): Promise<unknown> => {
  process.env = { ...env };

  let CoreConfigModule!: typeof ConfigModuleExports.CoreConfigModule;

  jest.isolateModules(() => {
    ({ CoreConfigModule } =
      jest.requireActual<typeof ConfigModuleExports>('../config.module'));
  });

  return Test.createTestingModule({ imports: [CoreConfigModule] }).compile();
};

describe('CoreConfigModule', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('refuses to boot in production with the .env.example values', async () => {
    const boot = bootCoreConfigModule({
      ...ENV_EXAMPLE,
      NODE_ENV: 'production',
    });

    await expect(boot).rejects.toThrow(/^Config validation error: /);

    const { message } = (await boot.catch((error: unknown) => error)) as Error;

    expect(
      INSECURE_EXAMPLE_KEYS.filter((key) => !message.includes(`"${key}"`)),
    ).toEqual([]);
  });

  it('boots in production once the insecure defaults are replaced', async () => {
    await expect(
      bootCoreConfigModule({
        ...ENV_EXAMPLE,
        ...HARDENED_PRODUCTION_ENV,
        NODE_ENV: 'production',
      }),
    ).resolves.toBeDefined();
  });
});
