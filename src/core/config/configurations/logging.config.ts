import { registerAs } from '@nestjs/config';
import { loggingEnvSchema } from '../validation/env.validation';
import { validateEnv } from '../validation/validate-env';

export const loggingConfig = registerAs('logging', () => {
  const env = validateEnv(loggingEnvSchema);

  return {
    level: env.LOG_LEVEL,
    pretty: env.LOG_PRETTY,
  };
});
