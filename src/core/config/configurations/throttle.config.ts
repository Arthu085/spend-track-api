import { registerAs } from '@nestjs/config';
import { throttleEnvSchema } from '../validation/env.validation';
import { validateEnv } from '../validation/validate-env';

export const throttleConfig = registerAs('throttle', () => {
  const env = validateEnv(throttleEnvSchema);

  return {
    ttl: env.THROTTLE_TTL,
    limit: env.THROTTLE_LIMIT,
    auth: {
      ttl: env.AUTH_THROTTLE_TTL,
      limit: env.AUTH_THROTTLE_LIMIT,
    },
    redisUrl: env.THROTTLE_REDIS_URL,
  };
});
