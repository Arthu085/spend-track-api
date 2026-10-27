import { registerAs } from '@nestjs/config';
import { appEnvSchema } from '../validation/env.validation';
import { validateEnv } from '../validation/validate-env';
import { parseTrustProxy } from './trust-proxy.parser';

export const appConfig = registerAs('app', () => {
  const env = validateEnv(appEnvSchema);

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    defaultLocale: env.DEFAULT_LOCALE,
    webUrl: env.APP_WEB_URL,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
  };
});
