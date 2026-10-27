import { registerAs } from '@nestjs/config';
import { databaseEnvSchema } from '../validation/env.validation';
import { validateEnv } from '../validation/validate-env';

export const databaseConfig = registerAs('database', () => {
  const env = validateEnv(databaseEnvSchema);

  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    name: env.DB_NAME,
    ssl: env.DB_SSL,
    poolMax: env.DB_POOL_MAX,
    statementTimeoutMs: env.DB_STATEMENT_TIMEOUT_MS,
  };
});
