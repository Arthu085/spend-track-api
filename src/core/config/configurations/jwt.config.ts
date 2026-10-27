import { registerAs } from '@nestjs/config';
import { jwtEnvSchema } from '../validation/env.validation';
import { validateEnv } from '../validation/validate-env';

export const jwtConfig = registerAs('jwt', () => {
  const env = validateEnv(jwtEnvSchema);

  return {
    accessSecret: env.JWT_ACCESS_SECRET,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshSecret: env.JWT_REFRESH_SECRET,
    refreshTtl: env.JWT_REFRESH_TTL,
  };
});
