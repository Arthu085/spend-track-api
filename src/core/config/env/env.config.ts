import { envSchema } from './env-schema.config';

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Erro nas variáveis de ambiente: ${error.message}`);
}

export const envConfig = {
  DB_HOST: envVars.DB_HOST,
  DB_PORT: envVars.DB_PORT,
  DB_USERNAME: envVars.DB_USERNAME,
  DB_PASSWORD: envVars.DB_PASSWORD,
  DB_NAME: envVars.DB_NAME,
  DB_SCHEMA: envVars.DB_SCHEMA,
  DB_SSL: envVars.DB_SSL,
  PORT: envVars.PORT,
  NODE_ENV: envVars.NODE_ENV,
  CLIENT_URL: envVars.CLIENT_URL,
  JWT_SECRET: envVars.JWT_SECRET,
  JWT_EXPIRES_IN: envVars.JWT_EXPIRES_IN,
  JWT_REFRESH_SECRET: envVars.JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRES_IN: envVars.JWT_REFRESH_EXPIRES_IN,
  COOKIE_DOMAIN: envVars.COOKIE_DOMAIN,
  COOKIE_SECURE: envVars.COOKIE_SECURE,
  COOKIE_SAME_SITE: envVars.COOKIE_SAME_SITE,
  COOKIE_ACCESS_MAX_AGE: envVars.COOKIE_ACCESS_MAX_AGE,
  COOKIE_REFRESH_MAX_AGE: envVars.COOKIE_REFRESH_MAX_AGE,
};
