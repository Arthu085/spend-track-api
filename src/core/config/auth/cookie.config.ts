import { CookieOptions } from 'express';
import { EnvOptions } from '../env/types/env.types';
import { isProduction } from '../env/helpers/env.helpers';

export const getCookieConfig = (env: EnvOptions): CookieOptions => ({
  httpOnly: true,
  secure: isProduction || env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAME_SITE,
  domain: env.COOKIE_DOMAIN,
});
