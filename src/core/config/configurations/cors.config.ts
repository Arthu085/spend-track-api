import { registerAs } from '@nestjs/config';
import { corsEnvSchema } from '../validation/env.validation';
import { validateEnv } from '../validation/validate-env';

export const corsConfig = registerAs('cors', () => {
  const env = validateEnv(corsEnvSchema);

  return {
    origins: env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
});
