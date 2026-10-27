import type { ValidationResult } from 'joi';
import {
  PRODUCTION_SECRET_MIN_LENGTH,
  validationSchema,
} from '../env.validation';

interface ValidatedEnv {
  NODE_ENV: string;
  PORT: number;
  DEFAULT_LOCALE: string;
  TRUST_PROXY: string;
  DB_HOST: string;
  DB_PORT: number;
  DB_SSL: boolean;
  DB_POOL_MAX: number;
  DB_STATEMENT_TIMEOUT_MS: number;
  JWT_ACCESS_TTL: string;
  JWT_REFRESH_TTL: string;
  EMAIL_CONFIRMATION_TOKEN_TTL_HOURS: number;
  PASSWORD_RESET_TOKEN_TTL_MINUTES: number;
  PASSWORD_RESET_TOKEN_RETENTION_DAYS: number;
  EMAIL_CONFIRMATION_TOKEN_RETENTION_DAYS: number;
  EMAIL_SEND_LOG_RETENTION_DAYS: number;
  AUDIT_LOG_RETENTION_DAYS: number;
  REFRESH_TOKEN_RETENTION_DAYS: number;
  RETENTION_CLEANUP_BATCH_SIZE: number;
  COOKIE_DOMAIN: string;
  COOKIE_SECURE: boolean;
  COOKIE_SAMESITE: string;
  CORS_ORIGINS: string;
  THROTTLE_TTL: number;
  THROTTLE_LIMIT: number;
  AUTH_THROTTLE_TTL: number;
  AUTH_THROTTLE_LIMIT: number;
  THROTTLE_REDIS_URL: string;
  LOG_LEVEL: string;
  LOG_PRETTY: boolean;
  MAIL_TRANSPORT: string;
  MAIL_HOST: string;
  MAIL_PORT: number;
  MAIL_SECURE: boolean;
  MAIL_FROM: string;
  MAIL_CONFIRM_EMAIL_PATH: string;
  MAIL_RESET_PASSWORD_PATH: string;
  APP_WEB_URL: string;
  MAIL_DAILY_LIMIT_PASSWORD_RESET: number;
  MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION: number;
  EMAIL_OUTBOX_RETENTION_DAYS: number;
  EMAIL_OUTBOX_WORKER_ENABLED: boolean;
  EMAIL_OUTBOX_POLL_INTERVAL_MS: number;
  EMAIL_OUTBOX_MAX_ATTEMPTS: number;
  EMAIL_OUTBOX_RETRY_BASE_DELAY_SECONDS: number;
}

const validEnv = {
  DB_USER: 'postgres',
  DB_PASSWORD: 'postgres',
  DB_NAME: 'app',
  JWT_ACCESS_SECRET: 'access-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
  COOKIE_SECRET: 'cookie-secret',
  SEED_ADMIN_EMAIL: 'seed-admin@example.com',
  SEED_ADMIN_PASSWORD: 'Dev-password1',
};

const productionEnv = {
  ...validEnv,
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'a'.repeat(PRODUCTION_SECRET_MIN_LENGTH),
  JWT_REFRESH_SECRET: 'r'.repeat(PRODUCTION_SECRET_MIN_LENGTH),
  COOKIE_SECRET: 'c'.repeat(PRODUCTION_SECRET_MIN_LENGTH),
  COOKIE_SECURE: 'true',
  MAIL_TRANSPORT: 'smtp',
  MAIL_HOST: 'smtp.example.com',
  MAIL_FROM: 'no-reply@example.com',
};

const validate = (env: Record<string, unknown>, abortEarly = true) =>
  validationSchema.validate(env, {
    abortEarly,
  }) as ValidationResult<ValidatedEnv>;

describe('validationSchema', () => {
  it('accepts a valid environment and applies defaults', () => {
    const result = validate(validEnv);

    const value = result.value as ValidatedEnv;

    expect(result.error).toBeUndefined();
    expect(value.NODE_ENV).toBe('development');
    expect(value.PORT).toBe(3000);
    expect(value.DEFAULT_LOCALE).toBe('pt-BR');
    expect(value.TRUST_PROXY).toBe('false');
    expect(value.DB_HOST).toBe('localhost');
    expect(value.DB_PORT).toBe(5432);
    expect(value.DB_SSL).toBe(false);
    expect(value.DB_POOL_MAX).toBe(10);
    expect(value.DB_STATEMENT_TIMEOUT_MS).toBe(0);
    expect(value.JWT_ACCESS_TTL).toBe('15m');
    expect(value.JWT_REFRESH_TTL).toBe('7d');
    expect(value.EMAIL_CONFIRMATION_TOKEN_TTL_HOURS).toBe(48);
    expect(value.PASSWORD_RESET_TOKEN_TTL_MINUTES).toBe(60);
    expect(value.PASSWORD_RESET_TOKEN_RETENTION_DAYS).toBe(7);
    expect(value.EMAIL_CONFIRMATION_TOKEN_RETENTION_DAYS).toBe(7);
    expect(value.EMAIL_SEND_LOG_RETENTION_DAYS).toBe(30);
    expect(value.AUDIT_LOG_RETENTION_DAYS).toBe(365);
    expect(value.RETENTION_CLEANUP_BATCH_SIZE).toBe(1000);
    expect(value.COOKIE_DOMAIN).toBe('');
    expect(value.COOKIE_SECURE).toBe(false);
    expect(value.COOKIE_SAMESITE).toBe('lax');
    expect(value.CORS_ORIGINS).toBe('http://localhost:5173');
    expect(value.THROTTLE_TTL).toBe(60);
    expect(value.THROTTLE_LIMIT).toBe(100);
    expect(value.AUTH_THROTTLE_TTL).toBe(60);
    expect(value.AUTH_THROTTLE_LIMIT).toBe(5);
    expect(value.THROTTLE_REDIS_URL).toBe('');
    expect(value.LOG_LEVEL).toBe('info');
    expect(value.LOG_PRETTY).toBe(false);
    expect(value.MAIL_TRANSPORT).toBe('log');
    expect(value.MAIL_HOST).toBe('');
    expect(value.MAIL_PORT).toBe(587);
    expect(value.MAIL_SECURE).toBe(false);
    expect(value.MAIL_FROM).toBe('');
    expect(value.MAIL_CONFIRM_EMAIL_PATH).toBe('/confirm-email');
    expect(value.MAIL_RESET_PASSWORD_PATH).toBe('/reset-password');
    expect(value.APP_WEB_URL).toBe('http://localhost:5173');
    expect(value.MAIL_DAILY_LIMIT_PASSWORD_RESET).toBe(5);
    expect(value.MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION).toBe(5);
    expect(value.EMAIL_OUTBOX_RETENTION_DAYS).toBe(7);
    expect(value.EMAIL_OUTBOX_WORKER_ENABLED).toBe(true);
    expect(value.EMAIL_OUTBOX_POLL_INTERVAL_MS).toBe(5000);
    expect(value.EMAIL_OUTBOX_MAX_ATTEMPTS).toBe(5);
    expect(value.EMAIL_OUTBOX_RETRY_BASE_DELAY_SECONDS).toBe(60);
  });

  it('fails when a required secret is missing', () => {
    const missingSecret: Record<string, string> = { ...validEnv };
    delete missingSecret.JWT_ACCESS_SECRET;

    const { error } = validate(missingSecret);

    expect(error).toBeDefined();
    expect(error?.message).toContain('JWT_ACCESS_SECRET');
  });

  it('fails when COOKIE_SECRET is missing', () => {
    const missingSecret: Record<string, string> = { ...validEnv };
    delete missingSecret.COOKIE_SECRET;

    const { error } = validate(missingSecret);

    expect(error).toBeDefined();
    expect(error?.message).toContain('COOKIE_SECRET');
  });

  it('applies the seed admin rules', () => {
    const { error } = validate({
      ...productionEnv,
      SEED_ADMIN_ENABLED: 'true',
      SEED_ADMIN_PASSWORD: '12345678',
    });

    expect(error?.message).toContain('SEED_ADMIN_PASSWORD');
  });

  it('rejects an invalid COOKIE_SAMESITE value', () => {
    const { error } = validate({ ...validEnv, COOKIE_SAMESITE: 'weird' });

    expect(error?.message).toContain('COOKIE_SAMESITE');
  });

  it('reports every error when abortEarly is disabled', () => {
    const { error } = validate({ NODE_ENV: 'staging' }, false);

    expect(error?.details.length).toBeGreaterThan(1);
  });

  it('rejects an invalid NODE_ENV value', () => {
    const { error } = validate({ ...validEnv, NODE_ENV: 'staging' });

    expect(error?.message).toContain('NODE_ENV');
  });

  it.each(['', '1', 'loopback', 'loopback, 10.0.0.0/8, fd00::/8'])(
    'accepts TRUST_PROXY=%p',
    (trustProxy) => {
      const { error } = validate({ ...validEnv, TRUST_PROXY: trustProxy });

      expect(error).toBeUndefined();
    },
  );

  it.each(['true', 'proxy.internal', '10.0.0.0/33', '0.0.0.0/0'])(
    'rejects TRUST_PROXY=%p',
    (trustProxy) => {
      const { error } = validate({ ...validEnv, TRUST_PROXY: trustProxy });

      expect(error?.message).toContain('TRUST_PROXY');
    },
  );

  it('accepts a valid LOG_LEVEL value', () => {
    const result = validate({ ...validEnv, LOG_LEVEL: 'debug' });

    const value = result.value as ValidatedEnv;

    expect(result.error).toBeUndefined();
    expect(value.LOG_LEVEL).toBe('debug');
  });

  it('rejects an invalid LOG_LEVEL value', () => {
    const { error } = validate({ ...validEnv, LOG_LEVEL: 'verbose' });

    expect(error?.message).toContain('LOG_LEVEL');
  });

  it('accepts a valid LOG_PRETTY value', () => {
    const result = validate({ ...validEnv, LOG_PRETTY: 'true' });

    const value = result.value as ValidatedEnv;

    expect(result.error).toBeUndefined();
    expect(value.LOG_PRETTY).toBe(true);
  });

  it('rejects an invalid LOG_PRETTY value', () => {
    const { error } = validate({ ...validEnv, LOG_PRETTY: 'garbage' });

    expect(error?.message).toContain('LOG_PRETTY');
  });

  it('rejects a zero EMAIL_CONFIRMATION_TOKEN_TTL_HOURS', () => {
    const { error } = validate({
      ...validEnv,
      EMAIL_CONFIRMATION_TOKEN_TTL_HOURS: 0,
    });

    expect(error?.message).toContain('EMAIL_CONFIRMATION_TOKEN_TTL_HOURS');
  });

  it('rejects a negative EMAIL_CONFIRMATION_TOKEN_TTL_HOURS', () => {
    const { error } = validate({
      ...validEnv,
      EMAIL_CONFIRMATION_TOKEN_TTL_HOURS: -1,
    });

    expect(error?.message).toContain('EMAIL_CONFIRMATION_TOKEN_TTL_HOURS');
  });

  it('accepts a custom EMAIL_CONFIRMATION_TOKEN_TTL_HOURS', () => {
    const result = validate({
      ...validEnv,
      EMAIL_CONFIRMATION_TOKEN_TTL_HOURS: 72,
    });

    const value = result.value as ValidatedEnv;

    expect(result.error).toBeUndefined();
    expect(value.EMAIL_CONFIRMATION_TOKEN_TTL_HOURS).toBe(72);
  });

  it('rejects a zero PASSWORD_RESET_TOKEN_TTL_MINUTES', () => {
    const { error } = validate({
      ...validEnv,
      PASSWORD_RESET_TOKEN_TTL_MINUTES: 0,
    });

    expect(error?.message).toContain('PASSWORD_RESET_TOKEN_TTL_MINUTES');
  });

  it('rejects a negative PASSWORD_RESET_TOKEN_TTL_MINUTES', () => {
    const { error } = validate({
      ...validEnv,
      PASSWORD_RESET_TOKEN_TTL_MINUTES: -1,
    });

    expect(error?.message).toContain('PASSWORD_RESET_TOKEN_TTL_MINUTES');
  });

  it('accepts a custom PASSWORD_RESET_TOKEN_TTL_MINUTES', () => {
    const result = validate({
      ...validEnv,
      PASSWORD_RESET_TOKEN_TTL_MINUTES: 30,
    });

    const value = result.value as ValidatedEnv;

    expect(result.error).toBeUndefined();
    expect(value.PASSWORD_RESET_TOKEN_TTL_MINUTES).toBe(30);
  });

  const retentionDaysVariables = [
    'REFRESH_TOKEN_RETENTION_DAYS',
    'PASSWORD_RESET_TOKEN_RETENTION_DAYS',
    'EMAIL_CONFIRMATION_TOKEN_RETENTION_DAYS',
    'EMAIL_SEND_LOG_RETENTION_DAYS',
    'EMAIL_OUTBOX_RETENTION_DAYS',
    'AUDIT_LOG_RETENTION_DAYS',
  ] as const;

  it.each(retentionDaysVariables)(
    'accepts 0 for %s to disable its cleanup',
    (name) => {
      const result = validate({ ...validEnv, [name]: 0 });

      expect(result.error).toBeUndefined();
      expect((result.value as ValidatedEnv)[name]).toBe(0);
    },
  );

  it.each(retentionDaysVariables)(
    'rejects a negative or fractional %s',
    (name) => {
      for (const invalid of [-1, 1.5]) {
        const { error } = validate({ ...validEnv, [name]: invalid });

        expect(error?.message).toContain(name);
      }
    },
  );

  it('rejects a zero, negative, or fractional RETENTION_CLEANUP_BATCH_SIZE', () => {
    for (const invalid of [0, -1, 1.5]) {
      const { error } = validate({
        ...validEnv,
        RETENTION_CLEANUP_BATCH_SIZE: invalid,
      });

      expect(error?.message).toContain('RETENTION_CLEANUP_BATCH_SIZE');
    }
  });

  it('accepts custom retention cleanup values', () => {
    const result = validate({
      ...validEnv,
      PASSWORD_RESET_TOKEN_RETENTION_DAYS: 1,
      EMAIL_CONFIRMATION_TOKEN_RETENTION_DAYS: 14,
      EMAIL_SEND_LOG_RETENTION_DAYS: 2,
      AUDIT_LOG_RETENTION_DAYS: 90,
      RETENTION_CLEANUP_BATCH_SIZE: 10000,
    });

    const value = result.value as ValidatedEnv;

    expect(result.error).toBeUndefined();
    expect(value.PASSWORD_RESET_TOKEN_RETENTION_DAYS).toBe(1);
    expect(value.EMAIL_CONFIRMATION_TOKEN_RETENTION_DAYS).toBe(14);
    expect(value.EMAIL_SEND_LOG_RETENTION_DAYS).toBe(2);
    expect(value.AUDIT_LOG_RETENTION_DAYS).toBe(90);
    expect(value.RETENTION_CLEANUP_BATCH_SIZE).toBe(10000);
  });

  it('rejects a RETENTION_CLEANUP_BATCH_SIZE above 10000', () => {
    const { error } = validate({
      ...validEnv,
      RETENTION_CLEANUP_BATCH_SIZE: 10001,
    });

    expect(error?.message).toContain('RETENTION_CLEANUP_BATCH_SIZE');
  });

  it('accepts managed-Postgres connection settings', () => {
    const result = validate({
      ...validEnv,
      DB_SSL: 'true',
      DB_POOL_MAX: '25',
      DB_STATEMENT_TIMEOUT_MS: '30000',
    });

    const value = result.value as ValidatedEnv;

    expect(result.error).toBeUndefined();
    expect(value.DB_SSL).toBe(true);
    expect(value.DB_POOL_MAX).toBe(25);
    expect(value.DB_STATEMENT_TIMEOUT_MS).toBe(30000);
  });

  it('rejects an invalid DB_SSL value', () => {
    const { error } = validate({ ...validEnv, DB_SSL: 'require' });

    expect(error?.message).toContain('DB_SSL');
  });

  it('rejects a zero, negative, or fractional DB_POOL_MAX', () => {
    for (const invalid of [0, -1, 1.5]) {
      const { error } = validate({ ...validEnv, DB_POOL_MAX: invalid });

      expect(error?.message).toContain('DB_POOL_MAX');
    }
  });

  it('rejects a negative or fractional DB_STATEMENT_TIMEOUT_MS', () => {
    for (const invalid of [-1, 1.5]) {
      const { error } = validate({
        ...validEnv,
        DB_STATEMENT_TIMEOUT_MS: invalid,
      });

      expect(error?.message).toContain('DB_STATEMENT_TIMEOUT_MS');
    }
  });

  it.each(['1', '3600000', '500ms', '900s', '15m', '12h', '7d'])(
    'accepts JWT TTLs of %p',
    (ttl) => {
      const result = validate({
        ...validEnv,
        JWT_ACCESS_TTL: ttl,
        JWT_REFRESH_TTL: ttl,
      });

      const value = result.value as ValidatedEnv;

      expect(result.error).toBeUndefined();
      expect(value.JWT_ACCESS_TTL).toBe(ttl);
      expect(value.JWT_REFRESH_TTL).toBe(ttl);
    },
  );

  it.each(['JWT_ACCESS_TTL', 'JWT_REFRESH_TTL'])(
    'rejects a malformed %s',
    (name) => {
      for (const invalid of [
        '',
        '15 m',
        ' 15m',
        '1.5h',
        '-1d',
        '7w',
        'm',
        '15M',
      ]) {
        const { error } = validate({ ...validEnv, [name]: invalid });

        expect(error?.message).toContain(name);
      }
    },
  );

  it('explains the expected JWT TTL format', () => {
    const { error } = validate({ ...validEnv, JWT_ACCESS_TTL: '15 minutes' });

    expect(error?.message).toBe(
      '"JWT_ACCESS_TTL" must be an integer with an optional ms, s, m, h, or d unit',
    );
  });

  it('accepts custom global throttle values', () => {
    const result = validate({
      ...validEnv,
      THROTTLE_TTL: '1',
      THROTTLE_LIMIT: '1000',
    });

    const value = result.value as ValidatedEnv;

    expect(result.error).toBeUndefined();
    expect(value.THROTTLE_TTL).toBe(1);
    expect(value.THROTTLE_LIMIT).toBe(1000);
  });

  it('accepts custom auth throttle values', () => {
    const result = validate({
      ...validEnv,
      AUTH_THROTTLE_TTL: '300',
      AUTH_THROTTLE_LIMIT: '10',
    });

    const value = result.value as ValidatedEnv;

    expect(result.error).toBeUndefined();
    expect(value.AUTH_THROTTLE_TTL).toBe(300);
    expect(value.AUTH_THROTTLE_LIMIT).toBe(10);
  });

  it.each([
    'THROTTLE_TTL',
    'THROTTLE_LIMIT',
    'AUTH_THROTTLE_TTL',
    'AUTH_THROTTLE_LIMIT',
  ])('rejects a zero, negative, fractional, or non-numeric %s', (name) => {
    for (const invalid of [0, -1, 1.5, 'abc', '1.5', '']) {
      const { error } = validate({ ...validEnv, [name]: invalid });

      expect(error?.message).toContain(name);
    }
  });

  it.each([
    'redis://localhost:6379',
    'redis://:secret@redis:6379/1',
    'rediss://user:secret@cache.example.com:6380',
    '',
  ])('accepts THROTTLE_REDIS_URL=%j', (url) => {
    const result = validate({ ...validEnv, THROTTLE_REDIS_URL: url });

    expect(result.error).toBeUndefined();
    expect((result.value as ValidatedEnv).THROTTLE_REDIS_URL).toBe(url);
  });

  it.each(['http://localhost:6379', 'localhost:6379', 'redis'])(
    'rejects THROTTLE_REDIS_URL=%j without a redis or rediss scheme',
    (url) => {
      const { error } = validate({ ...validEnv, THROTTLE_REDIS_URL: url });

      expect(error?.message).toContain('THROTTLE_REDIS_URL');
    },
  );

  it('accepts a valid MAIL_TRANSPORT value', () => {
    const result = validate({ ...validEnv, MAIL_TRANSPORT: 'log' });

    expect(result.error).toBeUndefined();
  });

  it('rejects an invalid MAIL_TRANSPORT value', () => {
    const { error } = validate({ ...validEnv, MAIL_TRANSPORT: 'imap' });

    expect(error?.message).toContain('MAIL_TRANSPORT');
  });

  it('fails when MAIL_TRANSPORT is smtp but MAIL_HOST is missing', () => {
    const { error } = validate({
      ...validEnv,
      MAIL_TRANSPORT: 'smtp',
      MAIL_FROM: 'no-reply@example.com',
    });

    expect(error?.message).toContain('MAIL_HOST');
  });

  it('fails when MAIL_TRANSPORT is smtp but MAIL_FROM is missing', () => {
    const { error } = validate({
      ...validEnv,
      MAIL_TRANSPORT: 'smtp',
      MAIL_HOST: 'smtp.example.com',
    });

    expect(error?.message).toContain('MAIL_FROM');
  });

  it('passes when MAIL_TRANSPORT is smtp with both MAIL_HOST and MAIL_FROM set', () => {
    const result = validate({
      ...validEnv,
      MAIL_TRANSPORT: 'smtp',
      MAIL_HOST: 'smtp.example.com',
      MAIL_FROM: 'no-reply@example.com',
    });

    expect(result.error).toBeUndefined();
  });

  it('applies mail defaults when the whole Mail block is absent from env', () => {
    const result = validate(validEnv);

    const value = result.value as ValidatedEnv;

    expect(result.error).toBeUndefined();
    expect(value.MAIL_TRANSPORT).toBe('log');
  });

  it.each(['not-a-url', 'file:///index.html', 'mailto:web@example.com'])(
    'rejects an invalid APP_WEB_URL=%p',
    (url) => {
      const { error } = validate({ ...validEnv, APP_WEB_URL: url });

      expect(error?.message).toContain('APP_WEB_URL');
    },
  );

  it('defaults CORS_ORIGINS to the origin of APP_WEB_URL', () => {
    const result = validate({
      ...validEnv,
      APP_WEB_URL: 'https://app.example.com/base/path',
    });

    const value = result.value as ValidatedEnv;

    expect(result.error).toBeUndefined();
    expect(value.CORS_ORIGINS).toBe('https://app.example.com');
  });

  it.each(['https://admin.example.com', ''])(
    'keeps an explicit CORS_ORIGINS=%p over the APP_WEB_URL default',
    (origins) => {
      const result = validate({
        ...validEnv,
        APP_WEB_URL: 'https://app.example.com',
        CORS_ORIGINS: origins,
      });

      const value = result.value as ValidatedEnv;

      expect(result.error).toBeUndefined();
      expect(value.CORS_ORIGINS).toBe(origins);
    },
  );

  it('accepts a comma-separated list of exact origins, including ports and spaces', () => {
    const origins = 'https://app.example.com, http://localhost:5173';

    const result = validate({ ...validEnv, CORS_ORIGINS: origins });

    expect(result.error).toBeUndefined();
    expect((result.value as ValidatedEnv).CORS_ORIGINS).toBe(origins);
  });

  it.each([
    ['a wildcard', '*'],
    ['the opaque null origin', 'null'],
    ['a trailing slash', 'https://app.example.com/'],
    ['a path', 'https://app.example.com/app'],
    ['an uppercase host', 'https://App.example.com'],
    ['a default port', 'https://app.example.com:443'],
    ['a non-http scheme', 'file:///index.html'],
    ['a bare host', 'app.example.com'],
    ['a subdomain wildcard', 'https://*.example.com'],
  ])('rejects a CORS_ORIGINS entry with %s', (_label, origin) => {
    const { error } = validate({
      ...validEnv,
      CORS_ORIGINS: `https://ok.example.com,${origin}`,
    });

    expect(error?.message).toContain('CORS_ORIGINS');
    expect(error?.message).toContain('exact http(s) origin');
  });

  it('accepts a zero MAIL_DAILY_LIMIT_PASSWORD_RESET (0 is a valid kill-switch value)', () => {
    const result = validate({
      ...validEnv,
      MAIL_DAILY_LIMIT_PASSWORD_RESET: 0,
    });

    const value = result.value as ValidatedEnv;

    expect(result.error).toBeUndefined();
    expect(value.MAIL_DAILY_LIMIT_PASSWORD_RESET).toBe(0);
  });

  it('rejects a negative MAIL_DAILY_LIMIT_PASSWORD_RESET', () => {
    const { error } = validate({
      ...validEnv,
      MAIL_DAILY_LIMIT_PASSWORD_RESET: -1,
    });

    expect(error?.message).toContain('MAIL_DAILY_LIMIT_PASSWORD_RESET');
  });

  it('rejects a non-integer MAIL_DAILY_LIMIT_PASSWORD_RESET', () => {
    const { error } = validate({
      ...validEnv,
      MAIL_DAILY_LIMIT_PASSWORD_RESET: 1.5,
    });

    expect(error?.message).toContain('MAIL_DAILY_LIMIT_PASSWORD_RESET');
  });

  it('accepts a custom MAIL_DAILY_LIMIT_PASSWORD_RESET', () => {
    const result = validate({
      ...validEnv,
      MAIL_DAILY_LIMIT_PASSWORD_RESET: 10,
    });

    const value = result.value as ValidatedEnv;

    expect(result.error).toBeUndefined();
    expect(value.MAIL_DAILY_LIMIT_PASSWORD_RESET).toBe(10);
  });

  it('accepts a zero MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION (0 is a valid kill-switch value)', () => {
    const result = validate({
      ...validEnv,
      MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION: 0,
    });

    const value = result.value as ValidatedEnv;

    expect(result.error).toBeUndefined();
    expect(value.MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION).toBe(0);
  });

  it('rejects a negative MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION', () => {
    const { error } = validate({
      ...validEnv,
      MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION: -1,
    });

    expect(error?.message).toContain('MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION');
  });

  it('rejects a non-integer MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION', () => {
    const { error } = validate({
      ...validEnv,
      MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION: 2.5,
    });

    expect(error?.message).toContain('MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION');
  });

  it('accepts a custom MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION', () => {
    const result = validate({
      ...validEnv,
      MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION: 15,
    });

    const value = result.value as ValidatedEnv;

    expect(result.error).toBeUndefined();
    expect(value.MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION).toBe(15);
  });

  it('accepts custom email outbox worker settings', () => {
    const result = validate({
      ...validEnv,
      EMAIL_OUTBOX_WORKER_ENABLED: 'false',
      EMAIL_OUTBOX_POLL_INTERVAL_MS: 250,
      EMAIL_OUTBOX_MAX_ATTEMPTS: 1,
      EMAIL_OUTBOX_RETRY_BASE_DELAY_SECONDS: 5,
    });

    const value = result.value as ValidatedEnv;

    expect(result.error).toBeUndefined();
    expect(value.EMAIL_OUTBOX_WORKER_ENABLED).toBe(false);
    expect(value.EMAIL_OUTBOX_POLL_INTERVAL_MS).toBe(250);
    expect(value.EMAIL_OUTBOX_MAX_ATTEMPTS).toBe(1);
    expect(value.EMAIL_OUTBOX_RETRY_BASE_DELAY_SECONDS).toBe(5);
  });

  it.each([
    ['EMAIL_OUTBOX_POLL_INTERVAL_MS', [9, 60_001, 1.5]],
    ['EMAIL_OUTBOX_MAX_ATTEMPTS', [0, 21, 1.5]],
    ['EMAIL_OUTBOX_RETRY_BASE_DELAY_SECONDS', [0, 3601, 1.5]],
  ])('rejects an out-of-range or fractional %s', (name, invalidValues) => {
    for (const invalid of invalidValues) {
      const { error } = validate({ ...validEnv, [name]: invalid });

      expect(error?.message).toContain(name);
    }
  });

  it('rejects a non-boolean EMAIL_OUTBOX_WORKER_ENABLED', () => {
    const { error } = validate({
      ...validEnv,
      EMAIL_OUTBOX_WORKER_ENABLED: 'sometimes',
    });

    expect(error?.message).toContain('EMAIL_OUTBOX_WORKER_ENABLED');
  });

  it.each(['none', 'lax'])(
    'accepts COOKIE_SAMESITE=%p with COOKIE_SECURE=true',
    (sameSite) => {
      const { error } = validate({
        ...validEnv,
        COOKIE_SECURE: 'true',
        COOKIE_SAMESITE: sameSite,
      });

      expect(error).toBeUndefined();
    },
  );

  it.each(['none', 'weird'])(
    'rejects COOKIE_SAMESITE=%p when COOKIE_SECURE is not true',
    (sameSite) => {
      const { error } = validate({ ...validEnv, COOKIE_SAMESITE: sameSite });

      expect(error?.message).toBe(
        '"COOKIE_SAMESITE" must be one of [strict, lax] (none requires "COOKIE_SECURE" to be true)',
      );
    },
  );

  describe('in production', () => {
    it('accepts a hardened configuration', () => {
      const result = validate(productionEnv, false);

      const value = result.value as ValidatedEnv;

      expect(result.error).toBeUndefined();
      expect(value.COOKIE_SECURE).toBe(true);
      expect(value.MAIL_TRANSPORT).toBe('smtp');
    });

    it('accepts COOKIE_SAMESITE=none with secure cookies', () => {
      const { error } = validate({ ...productionEnv, COOKIE_SAMESITE: 'none' });

      expect(error).toBeUndefined();
    });

    it('rejects the .env.example development defaults', () => {
      const { error } = validate(
        {
          ...validEnv,
          NODE_ENV: 'production',
          JWT_ACCESS_SECRET: 'change-me-access-secret',
          JWT_REFRESH_SECRET: 'change-me-refresh-secret',
          COOKIE_SECRET: 'change-me-cookie-secret',
          COOKIE_SECURE: 'false',
          MAIL_TRANSPORT: 'log',
        },
        false,
      );

      const invalidKeys = error?.details.map(({ context }) => context?.key);

      expect(invalidKeys).toEqual(
        expect.arrayContaining([
          'JWT_ACCESS_SECRET',
          'JWT_REFRESH_SECRET',
          'COOKIE_SECRET',
          'COOKIE_SECURE',
          'MAIL_TRANSPORT',
        ]),
      );
    });

    it.each(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'COOKIE_SECRET'])(
      'rejects a %s shorter than the minimum length',
      (key) => {
        const { error } = validate({
          ...productionEnv,
          [key]: 's'.repeat(PRODUCTION_SECRET_MIN_LENGTH - 1),
        });

        expect(error?.message).toBe(
          `"${key}" length must be at least ${PRODUCTION_SECRET_MIN_LENGTH} characters long`,
        );
      },
    );

    it.each([
      ['JWT_ACCESS_SECRET', 'change-me-access-secret-0123456789abcdef'],
      ['JWT_REFRESH_SECRET', 'CHANGEME_refresh_secret_0123456789abcdef'],
      ['COOKIE_SECRET', 'replace-me-with-a-real-cookie-secret-0123'],
      ['COOKIE_SECRET', 'placeholder-cookie-secret-0123456789abcdef'],
      ['JWT_ACCESS_SECRET', 'your_secret_here_0123456789abcdef0123456'],
    ])('rejects a placeholder %s (%p)', (key, value) => {
      const { error } = validate({ ...productionEnv, [key]: value });

      expect(error?.message).toBe(
        `"${key}" must not be a placeholder value in production`,
      );
    });

    it('rejects identical access and refresh secrets', () => {
      const { error } = validate({
        ...productionEnv,
        JWT_REFRESH_SECRET: productionEnv.JWT_ACCESS_SECRET,
      });

      expect(error?.message).toBe(
        '"JWT_REFRESH_SECRET" must differ from "JWT_ACCESS_SECRET" in production',
      );
    });

    it('rejects COOKIE_SECURE=false', () => {
      const { error } = validate({ ...productionEnv, COOKIE_SECURE: 'false' });

      expect(error?.message).toBe('"COOKIE_SECURE" must be true in production');
    });

    it('requires COOKIE_SECURE to be set explicitly', () => {
      const env: Record<string, string> = { ...productionEnv };
      delete env.COOKIE_SECURE;

      const { error } = validate(env);

      expect(error?.message).toBe('"COOKIE_SECURE" is required');
    });

    it('rejects MAIL_TRANSPORT=log', () => {
      const { error } = validate({ ...productionEnv, MAIL_TRANSPORT: 'log' });

      expect(error?.message).toBe(
        '"MAIL_TRANSPORT" must be smtp in production',
      );
    });

    it('requires MAIL_TRANSPORT to be set explicitly', () => {
      const env: Record<string, string> = { ...productionEnv };
      delete env.MAIL_TRANSPORT;

      const { error } = validate(env);

      expect(error?.message).toBe('"MAIL_TRANSPORT" is required');
    });
  });

  it('does not apply the production rules outside production', () => {
    const { error } = validate({
      ...validEnv,
      JWT_ACCESS_SECRET: 'change-me-access-secret',
      JWT_REFRESH_SECRET: 'change-me-access-secret',
      COOKIE_SECRET: 'short',
      COOKIE_SECURE: 'false',
      MAIL_TRANSPORT: 'log',
    });

    expect(error).toBeUndefined();
  });
});
