import * as Joi from 'joi';
import { parseTrustProxy } from '../configurations/trust-proxy.parser';
import { isProduction, NodeEnv, nodeEnvSchema } from './node-env.validation';
import { seedAdminValidationSchema } from './seed-admin.validation';

export const PRODUCTION_SECRET_MIN_LENGTH = 32;

const PLACEHOLDER_SECRET_PATTERN =
  /change[-_]?me|replace[-_]?me|placeholder|your[-_]?secret|^secret$/i;

const DURATION_PATTERN = /^\d+(ms|s|m|h|d)?$/;

const durationSchema = Joi.string().pattern(DURATION_PATTERN).messages({
  'string.pattern.base':
    '{{#label}} must be an integer with an optional ms, s, m, h, or d unit',
});

const secretSchema = Joi.string()
  .required()
  .when('NODE_ENV', {
    ...isProduction,
    then: Joi.string()
      .min(PRODUCTION_SECRET_MIN_LENGTH)
      .pattern(PLACEHOLDER_SECRET_PATTERN, { invert: true })
      .messages({
        'string.pattern.invert.base':
          '{{#label}} must not be a placeholder value in production',
      }),
  });

const appWebUrlSchema = Joi.string()
  .uri({ scheme: ['http', 'https'] })
  .default('http://localhost:5173');

interface AppEnv {
  NODE_ENV: NodeEnv;
  PORT: number;
  DEFAULT_LOCALE: string;
  TRUST_PROXY: string;
  APP_WEB_URL: string;
}

export const appEnvSchema = Joi.object<AppEnv>({
  NODE_ENV: nodeEnvSchema,
  PORT: Joi.number().port().default(3000),
  DEFAULT_LOCALE: Joi.string().default('pt-BR'),
  TRUST_PROXY: Joi.string()
    .allow('')
    .default('false')
    .custom((value: string) => {
      parseTrustProxy(value);
      return value;
    }),
  APP_WEB_URL: appWebUrlSchema,
});

interface DatabaseEnv {
  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  DB_SSL: boolean;
  DB_POOL_MAX: number;
  DB_STATEMENT_TIMEOUT_MS: number;
}

export const databaseEnvSchema = Joi.object<DatabaseEnv>({
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().port().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.boolean().default(false),
  DB_POOL_MAX: Joi.number().integer().min(1).default(10),
  DB_STATEMENT_TIMEOUT_MS: Joi.number().integer().min(0).default(0),
});

interface JwtEnv {
  NODE_ENV: NodeEnv;
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_TTL: string;
  JWT_REFRESH_SECRET: string;
  JWT_REFRESH_TTL: string;
}

export const jwtEnvSchema = Joi.object<JwtEnv>({
  NODE_ENV: nodeEnvSchema,
  JWT_ACCESS_SECRET: secretSchema,
  JWT_ACCESS_TTL: durationSchema.default('15m'),
  JWT_REFRESH_SECRET: secretSchema.when('NODE_ENV', {
    ...isProduction,
    then: Joi.string().invalid(Joi.ref('JWT_ACCESS_SECRET')).messages({
      'any.invalid':
        '"JWT_REFRESH_SECRET" must differ from "JWT_ACCESS_SECRET" in production',
    }),
  }),
  JWT_REFRESH_TTL: durationSchema.default('7d'),
});

interface RefreshTokenCleanupEnv {
  REFRESH_TOKEN_RETENTION_DAYS: number;
}

export const refreshTokenCleanupEnvSchema = Joi.object<RefreshTokenCleanupEnv>({
  REFRESH_TOKEN_RETENTION_DAYS: Joi.number().integer().min(0).default(30),
});

interface VerificationTokensEnv {
  EMAIL_CONFIRMATION_TOKEN_TTL_HOURS: number;
  PASSWORD_RESET_TOKEN_TTL_MINUTES: number;
  USER_CHANGE_REQUEST_TTL_HOURS: number;
}

export const verificationTokensEnvSchema = Joi.object<VerificationTokensEnv>({
  EMAIL_CONFIRMATION_TOKEN_TTL_HOURS: Joi.number().integer().min(1).default(48),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: Joi.number().integer().min(1).default(60),
  USER_CHANGE_REQUEST_TTL_HOURS: Joi.number().integer().min(1).default(48),
});

interface RetentionCleanupEnv {
  PASSWORD_RESET_TOKEN_RETENTION_DAYS: number;
  EMAIL_CONFIRMATION_TOKEN_RETENTION_DAYS: number;
  EMAIL_SEND_LOG_RETENTION_DAYS: number;
  EMAIL_OUTBOX_RETENTION_DAYS: number;
  AUDIT_LOG_RETENTION_DAYS: number;
  RETENTION_CLEANUP_BATCH_SIZE: number;
}

export const retentionCleanupEnvSchema = Joi.object<RetentionCleanupEnv>({
  PASSWORD_RESET_TOKEN_RETENTION_DAYS: Joi.number().integer().min(0).default(7),
  EMAIL_CONFIRMATION_TOKEN_RETENTION_DAYS: Joi.number()
    .integer()
    .min(0)
    .default(7),
  EMAIL_SEND_LOG_RETENTION_DAYS: Joi.number().integer().min(0).default(30),
  EMAIL_OUTBOX_RETENTION_DAYS: Joi.number().integer().min(0).default(7),
  AUDIT_LOG_RETENTION_DAYS: Joi.number().integer().min(0).default(365),
  RETENTION_CLEANUP_BATCH_SIZE: Joi.number()
    .integer()
    .min(1)
    .max(10000)
    .default(1000),
});

interface CookieEnv {
  NODE_ENV: NodeEnv;
  COOKIE_SECRET: string;
  COOKIE_DOMAIN: string;
  COOKIE_SECURE: boolean;
  COOKIE_SAMESITE: 'strict' | 'lax' | 'none';
}

export const cookieEnvSchema = Joi.object<CookieEnv>({
  NODE_ENV: nodeEnvSchema,
  COOKIE_SECRET: secretSchema,
  COOKIE_DOMAIN: Joi.string().allow('').default(''),
  COOKIE_SECURE: Joi.boolean()
    .default(false)
    .when('NODE_ENV', {
      ...isProduction,
      then: Joi.boolean().valid(true).required().messages({
        'any.only': '"COOKIE_SECURE" must be true in production',
      }),
    }),
  COOKIE_SAMESITE: Joi.string()
    .valid('strict', 'lax', 'none')
    .default('lax')
    .when('COOKIE_SECURE', {
      is: false,
      then: Joi.string().valid(Joi.override, 'strict', 'lax').messages({
        'any.only':
          '{{#label}} must be one of {{#valids}} (none requires "COOKIE_SECURE" to be true)',
      }),
    }),
});

interface CorsEnv {
  APP_WEB_URL: string;
  CORS_ORIGINS: string;
}

const webAppOrigin = ({ APP_WEB_URL }: CorsEnv) =>
  URL.canParse(APP_WEB_URL) ? new URL(APP_WEB_URL).origin : '';

const isSerializedHttpOrigin = (value: string): boolean => {
  if (value.includes('*') || !URL.canParse(value)) {
    return false;
  }

  const url = new URL(value);

  return (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.origin === value
  );
};

export const corsEnvSchema = Joi.object<CorsEnv>({
  APP_WEB_URL: appWebUrlSchema,
  CORS_ORIGINS: Joi.string()
    .allow('')
    .default(webAppOrigin)
    .custom((value: string, helpers) => {
      const invalid = value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
        .find((origin) => !isSerializedHttpOrigin(origin));

      return invalid === undefined
        ? value
        : helpers.error('string.corsOrigin', { origin: invalid });
    })
    .messages({
      'string.corsOrigin':
        '{{#label}} entry {{#origin}} must be an exact http(s) origin such as ' +
        'https://app.example.com (no path, trailing slash, or wildcard)',
    }),
});

interface ThrottleEnv {
  THROTTLE_TTL: number;
  THROTTLE_LIMIT: number;
  AUTH_THROTTLE_TTL: number;
  AUTH_THROTTLE_LIMIT: number;
  THROTTLE_REDIS_URL: string;
}

export const throttleEnvSchema = Joi.object<ThrottleEnv>({
  THROTTLE_TTL: Joi.number().integer().min(1).default(60),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(100),
  AUTH_THROTTLE_TTL: Joi.number().integer().min(1).default(60),
  AUTH_THROTTLE_LIMIT: Joi.number().integer().min(1).default(5),
  THROTTLE_REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .allow('')
    .default(''),
});

interface LoggingEnv {
  LOG_LEVEL: string;
  LOG_PRETTY: boolean;
}

export const loggingEnvSchema = Joi.object<LoggingEnv>({
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  LOG_PRETTY: Joi.boolean().default(false),
});

interface MailEnv {
  NODE_ENV: NodeEnv;
  MAIL_TRANSPORT: 'log' | 'smtp';
  MAIL_HOST: string;
  MAIL_PORT: number;
  MAIL_SECURE: boolean;
  MAIL_USER: string;
  MAIL_PASSWORD: string;
  MAIL_FROM: string;
  MAIL_CONFIRM_EMAIL_PATH: string;
  MAIL_RESET_PASSWORD_PATH: string;
  MAIL_USER_CHANGE_REQUEST_PATH: string;
}

export const mailEnvSchema = Joi.object<MailEnv>({
  NODE_ENV: nodeEnvSchema,
  MAIL_TRANSPORT: Joi.string()
    .valid('log', 'smtp')
    .default('log')
    .when('NODE_ENV', {
      ...isProduction,
      then: Joi.string().valid(Joi.override, 'smtp').required().messages({
        'any.only': '"MAIL_TRANSPORT" must be smtp in production',
      }),
    }),
  MAIL_HOST: Joi.string()
    .allow('')
    .when('MAIL_TRANSPORT', { is: 'smtp', then: Joi.string().required() })
    .default(''),
  MAIL_PORT: Joi.number().port().default(587),
  MAIL_SECURE: Joi.boolean().default(false),
  MAIL_USER: Joi.string().allow('').default(''),
  MAIL_PASSWORD: Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string()
    .allow('')
    .when('MAIL_TRANSPORT', { is: 'smtp', then: Joi.string().required() })
    .default(''),
  MAIL_CONFIRM_EMAIL_PATH: Joi.string().default('/confirm-email'),
  MAIL_RESET_PASSWORD_PATH: Joi.string().default('/reset-password'),
  MAIL_USER_CHANGE_REQUEST_PATH: Joi.string().default(
    '/account/change-requests',
  ),
});

interface EmailQuotaEnv {
  MAIL_DAILY_LIMIT_PASSWORD_RESET: number;
  MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION: number;
  MAIL_DAILY_LIMIT_USER_CHANGE_REQUEST: number;
  MAIL_DAILY_LIMIT_EMAIL_CHANGE_NOTICE: number;
}

export const emailQuotaEnvSchema = Joi.object<EmailQuotaEnv>({
  MAIL_DAILY_LIMIT_PASSWORD_RESET: Joi.number().integer().min(0).default(5),
  MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION: Joi.number().integer().min(0).default(5),
  MAIL_DAILY_LIMIT_USER_CHANGE_REQUEST: Joi.number()
    .integer()
    .min(0)
    .default(5),
  MAIL_DAILY_LIMIT_EMAIL_CHANGE_NOTICE: Joi.number()
    .integer()
    .min(0)
    .default(5),
});

interface EmailOutboxEnv {
  EMAIL_OUTBOX_WORKER_ENABLED: boolean;
  EMAIL_OUTBOX_POLL_INTERVAL_MS: number;
  EMAIL_OUTBOX_MAX_ATTEMPTS: number;
  EMAIL_OUTBOX_RETRY_BASE_DELAY_SECONDS: number;
}

export const emailOutboxEnvSchema = Joi.object<EmailOutboxEnv>({
  EMAIL_OUTBOX_WORKER_ENABLED: Joi.boolean().default(true),
  EMAIL_OUTBOX_POLL_INTERVAL_MS: Joi.number()
    .integer()
    .min(10)
    .max(60_000)
    .default(5000),
  EMAIL_OUTBOX_MAX_ATTEMPTS: Joi.number().integer().min(1).max(20).default(5),
  EMAIL_OUTBOX_RETRY_BASE_DELAY_SECONDS: Joi.number()
    .integer()
    .min(1)
    .max(3600)
    .default(60),
});

export const validationSchema = Joi.object()
  .concat(appEnvSchema)
  .concat(databaseEnvSchema)
  .concat(jwtEnvSchema)
  .concat(refreshTokenCleanupEnvSchema)
  .concat(verificationTokensEnvSchema)
  .concat(retentionCleanupEnvSchema)
  .concat(cookieEnvSchema)
  .concat(corsEnvSchema)
  .concat(throttleEnvSchema)
  .concat(loggingEnvSchema)
  .concat(mailEnvSchema)
  .concat(emailQuotaEnvSchema)
  .concat(emailOutboxEnvSchema)
  .concat(seedAdminValidationSchema);
