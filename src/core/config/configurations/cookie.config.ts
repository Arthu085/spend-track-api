import { registerAs } from '@nestjs/config';
import { cookieEnvSchema } from '../validation/env.validation';
import { validateEnv } from '../validation/validate-env';

export const cookieConfig = registerAs('cookie', () => {
  const env = validateEnv(cookieEnvSchema);

  return {
    secret: env.COOKIE_SECRET,
    domain: env.COOKIE_DOMAIN,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
  };
});
