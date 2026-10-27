import { registerAs } from '@nestjs/config';
import { refreshTokenCleanupEnvSchema } from '../validation/env.validation';
import { validateEnv } from '../validation/validate-env';

export const refreshTokenCleanupConfig = registerAs(
  'refreshTokenCleanup',
  () => {
    const env = validateEnv(refreshTokenCleanupEnvSchema);

    return {
      retentionDays: env.REFRESH_TOKEN_RETENTION_DAYS,
    };
  },
);
