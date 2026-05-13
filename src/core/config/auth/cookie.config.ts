import { CookieOptions } from 'express';
import { envConfig } from '../env/env.config';
import { isProduction } from '../env/helpers/env.helpers';

export const cookieConfig: CookieOptions = {
  httpOnly: true,
  secure: isProduction || envConfig.COOKIE_SECURE,
  sameSite: envConfig.COOKIE_SAME_SITE,
  domain: envConfig.COOKIE_DOMAIN,
};
