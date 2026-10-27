import {
  appConfig,
  cookieConfig,
  corsConfig,
  databaseConfig,
  emailOutboxConfig,
  emailQuotaConfig,
  jwtConfig,
  loggingConfig,
  mailConfig,
  refreshTokenCleanupConfig,
  retentionCleanupConfig,
  throttleConfig,
  verificationTokensConfig,
} from '..';
import { validationSchema } from '../../validation/env.validation';

const REQUIRED_ENV = {
  DB_USER: 'postgres',
  DB_PASSWORD: 'postgres',
  DB_NAME: 'app',
  JWT_ACCESS_SECRET: 'access-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
  COOKIE_SECRET: 'cookie-secret',
  SEED_ADMIN_EMAIL: 'seed-admin@example.com',
  SEED_ADMIN_PASSWORD: 'Seed-admin-password1',
};

const factories = {
  appConfig,
  cookieConfig,
  corsConfig,
  databaseConfig,
  emailOutboxConfig,
  emailQuotaConfig,
  jwtConfig,
  loggingConfig,
  mailConfig,
  refreshTokenCleanupConfig,
  retentionCleanupConfig,
  throttleConfig,
  verificationTokensConfig,
};

// Mirrors `ConfigModule.forRoot`, which writes the Joi-validated values
// (defaults included) back into `process.env` as strings before the
// `registerAs` factories run.
const toNestValidatedEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const result = validationSchema.validate(env, { abortEarly: false });

  if (result.error) {
    throw result.error;
  }

  return Object.fromEntries(
    Object.entries(result.value as Record<string, unknown>).map(
      ([key, entry]) => [key, String(entry)],
    ),
  );
};

describe('configuration factories', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...REQUIRED_ENV };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('maps app config from the environment', () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '4000';
    process.env.DEFAULT_LOCALE = 'en';
    process.env.APP_WEB_URL = 'https://app.example.com';
    process.env.TRUST_PROXY = 'loopback, 10.0.0.0/8';

    expect(appConfig()).toEqual({
      nodeEnv: 'test',
      port: 4000,
      defaultLocale: 'en',
      webUrl: 'https://app.example.com',
      trustProxy: ['loopback', '10.0.0.0/8'],
    });
  });

  it('maps throttle config from the environment', () => {
    process.env.THROTTLE_TTL = '120';
    process.env.THROTTLE_LIMIT = '200';
    process.env.AUTH_THROTTLE_TTL = '300';
    process.env.AUTH_THROTTLE_LIMIT = '10';
    process.env.THROTTLE_REDIS_URL = 'redis://redis:6379/0';

    expect(throttleConfig()).toEqual({
      ttl: 120,
      limit: 200,
      auth: { ttl: 300, limit: 10 },
      redisUrl: 'redis://redis:6379/0',
    });
  });

  it('maps database config from the environment', () => {
    process.env.DB_HOST = 'db';
    process.env.DB_PORT = '5433';
    process.env.DB_USER = 'user';
    process.env.DB_PASSWORD = 'pass';
    process.env.DB_NAME = 'app';
    process.env.DB_SSL = 'true';
    process.env.DB_POOL_MAX = '25';
    process.env.DB_STATEMENT_TIMEOUT_MS = '30000';

    expect(databaseConfig()).toEqual({
      host: 'db',
      port: 5433,
      user: 'user',
      password: 'pass',
      name: 'app',
      ssl: true,
      poolMax: 25,
      statementTimeoutMs: 30000,
    });
  });

  it.each(['TRUE', 'True'])('parses DB_SSL=%p as enabled', (value) => {
    process.env.DB_SSL = value;

    expect(databaseConfig().ssl).toBe(true);
  });

  it('parses DB_SSL="false" as disabled', () => {
    process.env.DB_SSL = 'false';

    expect(databaseConfig().ssl).toBe(false);
  });

  it('maps jwt config from the environment', () => {
    process.env.JWT_ACCESS_SECRET = 'access';
    process.env.JWT_ACCESS_TTL = '10m';
    process.env.JWT_REFRESH_SECRET = 'refresh';
    process.env.JWT_REFRESH_TTL = '30d';

    expect(jwtConfig()).toEqual({
      accessSecret: 'access',
      accessTtl: '10m',
      refreshSecret: 'refresh',
      refreshTtl: '30d',
    });
  });

  it('maps cookie config from the environment', () => {
    process.env.COOKIE_SECRET = 'secret';
    process.env.COOKIE_DOMAIN = 'example.com';
    process.env.COOKIE_SECURE = 'true';
    process.env.COOKIE_SAMESITE = 'strict';

    expect(cookieConfig()).toEqual({
      secret: 'secret',
      domain: 'example.com',
      secure: true,
      sameSite: 'strict',
    });
  });

  it('splits cors origins into a trimmed list', () => {
    process.env.CORS_ORIGINS = 'http://a.com, http://b.com ,';

    expect(corsConfig()).toEqual({
      origins: ['http://a.com', 'http://b.com'],
    });
  });

  it('defaults cors origins to the web app origin', () => {
    process.env.APP_WEB_URL = 'https://app.example.com/base/path';

    expect(corsConfig()).toEqual({ origins: ['https://app.example.com'] });
  });

  it('maps logging config from the environment', () => {
    process.env.LOG_LEVEL = 'debug';
    process.env.LOG_PRETTY = 'true';

    expect(loggingConfig()).toEqual({
      level: 'debug',
      pretty: true,
    });
  });

  it('maps verification-tokens config from the environment', () => {
    process.env.EMAIL_CONFIRMATION_TOKEN_TTL_HOURS = '72';
    process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES = '30';
    process.env.USER_CHANGE_REQUEST_TTL_HOURS = '12';

    expect(verificationTokensConfig()).toEqual({
      emailConfirmationTtlHours: 72,
      passwordResetTtlMinutes: 30,
      userChangeRequestTtlHours: 12,
    });
  });

  it('maps mail config from the environment', () => {
    process.env.MAIL_TRANSPORT = 'smtp';
    process.env.MAIL_HOST = 'smtp.example.com';
    process.env.MAIL_PORT = '2525';
    process.env.MAIL_SECURE = 'true';
    process.env.MAIL_USER = 'user';
    process.env.MAIL_PASSWORD = 'pass';
    process.env.MAIL_FROM = 'App <no-reply@example.com>';
    process.env.MAIL_CONFIRM_EMAIL_PATH = '/custom-confirm';
    process.env.MAIL_RESET_PASSWORD_PATH = '/custom-reset';
    process.env.MAIL_USER_CHANGE_REQUEST_PATH = '/custom-change-requests';

    expect(mailConfig()).toEqual({
      transport: 'smtp',
      host: 'smtp.example.com',
      port: 2525,
      secure: true,
      user: 'user',
      password: 'pass',
      from: 'App <no-reply@example.com>',
      confirmEmailPath: '/custom-confirm',
      resetPasswordPath: '/custom-reset',
      userChangeRequestPath: '/custom-change-requests',
    });
  });

  it.each([
    ['MAIL_TRANSPORT', 'unsupported', () => mailConfig()],
    ['DB_PORT', 'not-a-port', () => databaseConfig()],
    ['COOKIE_SAMESITE', 'none', () => cookieConfig()],
    ['THROTTLE_LIMIT', 'many', () => throttleConfig()],
  ])(
    'rejects an invalid %s=%p instead of falling back to a default',
    (key, value, load) => {
      process.env[key] = value;

      expect(load).toThrow(/^Config validation error: .*"/);
    },
  );

  it('rejects a missing required variable instead of falling back to an empty value', () => {
    delete process.env.DB_NAME;

    expect(() => databaseConfig()).toThrow(
      'Config validation error: "DB_NAME" is required',
    );
  });

  it('normalizes MAIL_SECURE from a string flag to a boolean', () => {
    process.env.MAIL_SECURE = 'false';

    expect(mailConfig().secure).toBe(false);
  });

  it('maps email-quota config from the environment, parsing each limit as an integer', () => {
    process.env.MAIL_DAILY_LIMIT_PASSWORD_RESET = '3';
    process.env.MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION = '9';
    process.env.MAIL_DAILY_LIMIT_USER_CHANGE_REQUEST = '4';
    process.env.MAIL_DAILY_LIMIT_EMAIL_CHANGE_NOTICE = '2';

    expect(emailQuotaConfig()).toEqual({
      passwordResetDailyLimit: 3,
      emailConfirmationDailyLimit: 9,
      userChangeRequestDailyLimit: 4,
      emailChangeNoticeDailyLimit: 2,
    });
  });

  it('does not mix up the two email-quota limits (independently configurable)', () => {
    process.env.MAIL_DAILY_LIMIT_PASSWORD_RESET = '1';
    process.env.MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION = '20';

    const config = emailQuotaConfig();

    expect(config.passwordResetDailyLimit).toBe(1);
    expect(config.emailConfirmationDailyLimit).toBe(20);
  });

  it('applies the schema defaults when optional env vars are absent', () => {
    expect(appConfig()).toEqual({
      nodeEnv: 'development',
      port: 3000,
      defaultLocale: 'pt-BR',
      webUrl: 'http://localhost:5173',
      trustProxy: false,
    });

    expect(databaseConfig()).toEqual({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: 'postgres',
      name: 'app',
      ssl: false,
      poolMax: 10,
      statementTimeoutMs: 0,
    });

    expect(jwtConfig()).toEqual({
      accessSecret: 'access-secret',
      accessTtl: '15m',
      refreshSecret: 'refresh-secret',
      refreshTtl: '7d',
    });

    expect(corsConfig()).toEqual({
      origins: ['http://localhost:5173'],
    });

    expect(cookieConfig()).toEqual({
      secret: 'cookie-secret',
      domain: '',
      secure: false,
      sameSite: 'lax',
    });

    expect(throttleConfig()).toEqual({
      ttl: 60,
      limit: 100,
      auth: { ttl: 60, limit: 5 },
      redisUrl: '',
    });

    expect(loggingConfig()).toEqual({
      level: 'info',
      pretty: false,
    });

    expect(verificationTokensConfig()).toEqual({
      emailConfirmationTtlHours: 48,
      passwordResetTtlMinutes: 60,
      userChangeRequestTtlHours: 48,
    });

    expect(mailConfig()).toEqual({
      transport: 'log',
      host: '',
      port: 587,
      secure: false,
      user: '',
      password: '',
      from: '',
      confirmEmailPath: '/confirm-email',
      resetPasswordPath: '/reset-password',
      userChangeRequestPath: '/account/change-requests',
    });

    expect(emailQuotaConfig()).toEqual({
      passwordResetDailyLimit: 5,
      emailConfirmationDailyLimit: 5,
      userChangeRequestDailyLimit: 5,
      emailChangeNoticeDailyLimit: 5,
    });

    expect(refreshTokenCleanupConfig()).toEqual({
      retentionDays: 30,
    });

    expect(retentionCleanupConfig()).toEqual({
      batchSize: 1000,
      passwordResetTokenDays: 7,
      emailConfirmationTokenDays: 7,
      emailSendLogDays: 30,
      emailOutboxDays: 7,
      auditLogDays: 365,
    });

    expect(emailOutboxConfig()).toEqual({
      workerEnabled: true,
      pollIntervalMs: 5000,
      maxAttempts: 5,
      retryBaseDelayMs: 60_000,
    });
  });

  it('maps email-outbox config from the environment, converting the retry delay to milliseconds', () => {
    process.env.EMAIL_OUTBOX_WORKER_ENABLED = 'false';
    process.env.EMAIL_OUTBOX_POLL_INTERVAL_MS = '250';
    process.env.EMAIL_OUTBOX_MAX_ATTEMPTS = '3';
    process.env.EMAIL_OUTBOX_RETRY_BASE_DELAY_SECONDS = '30';

    expect(emailOutboxConfig()).toEqual({
      workerEnabled: false,
      pollIntervalMs: 250,
      maxAttempts: 3,
      retryBaseDelayMs: 30_000,
    });
  });

  it.each(Object.entries(factories))(
    '%s resolves the same values from the raw env and from the env ConfigModule validated',
    (_name, factory) => {
      const fromRawEnv = factory();

      process.env = toNestValidatedEnv(REQUIRED_ENV);

      expect(factory()).toEqual(fromRawEnv);
    },
  );
});
