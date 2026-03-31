import { envConfig } from '../env/env.config';
import { isProduction } from '../env/env.helpers';

export const cookieConfig = {
  httpOnly: true,
  secure: envConfig.COOKIE_SECURE ?? isProduction,
  sameSite: envConfig.COOKIE_SAME_SITE,
  domain: envConfig.COOKIE_DOMAIN,
};
