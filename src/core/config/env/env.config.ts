import { EnvOptions } from './types/env.types';
import { registerAs } from '@nestjs/config';
import type { StringValue } from 'ms';

export const envConfig = registerAs('env', (): EnvOptions => {
  return {
    DB_HOST: process.env.DB_HOST!,
    DB_PORT: parseInt(process.env.DB_PORT!, 10),
    DB_USERNAME: process.env.DB_USERNAME!,
    DB_PASSWORD: process.env.DB_PASSWORD!,
    DB_NAME: process.env.DB_NAME!,
    DB_SCHEMA: process.env.DB_SCHEMA!,
    DB_SSL: process.env.DB_SSL === 'true' || process.env.DB_SSL === '1',
    PORT: parseInt(process.env.PORT!, 10),
    NODE_ENV: process.env.NODE_ENV as 'development' | 'production' | 'test',
    CLIENT_URL: process.env.CLIENT_URL!,
    JWT_SECRET: process.env.JWT_SECRET!,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN as StringValue,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN as StringValue,
    COOKIE_DOMAIN: process.env.COOKIE_DOMAIN,
    COOKIE_SECURE:
      process.env.COOKIE_SECURE === 'true' || process.env.COOKIE_SECURE === '1',
    COOKIE_SAME_SITE: process.env.COOKIE_SAME_SITE as 'strict' | 'lax' | 'none',
    COOKIE_ACCESS_MAX_AGE: parseInt(process.env.COOKIE_ACCESS_MAX_AGE!, 10),
    COOKIE_REFRESH_MAX_AGE: parseInt(process.env.COOKIE_REFRESH_MAX_AGE!, 10),
  };
});
