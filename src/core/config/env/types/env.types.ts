import type { StringValue } from 'ms';

export type EnvOptions = {
  DB_HOST: string;
  DB_PORT: number;
  DB_USERNAME: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  DB_SCHEMA: string;
  DB_SSL: boolean;
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  CLIENT_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: StringValue;
  JWT_REFRESH_SECRET: string;
  JWT_REFRESH_EXPIRES_IN: StringValue;
  COOKIE_DOMAIN?: string;
  COOKIE_SECURE: boolean;
  COOKIE_SAME_SITE: 'strict' | 'lax' | 'none';
  COOKIE_ACCESS_MAX_AGE: number;
  COOKIE_REFRESH_MAX_AGE: number;
};
