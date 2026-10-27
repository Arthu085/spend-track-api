import { AppConfigService } from '../app-config.service';

describe('AppConfigService', () => {
  const app = {
    nodeEnv: 'test' as const,
    port: 3000,
    defaultLocale: 'pt-BR',
    webUrl: 'http://localhost:5173',
    trustProxy: false as const,
  };

  const database = {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    name: 'app',
    ssl: false,
    poolMax: 10,
    statementTimeoutMs: 0,
  };

  const jwt = {
    accessSecret: 'access',
    accessTtl: '15m',
    refreshSecret: 'refresh',
    refreshTtl: '7d',
  };

  const cors = {
    origins: ['http://localhost:3000'],
  };

  const throttle = {
    ttl: 60,
    limit: 100,
    auth: { ttl: 60, limit: 5 },
    redisUrl: '',
  };

  const cookie = {
    secret: 'secret',
    domain: '',
    secure: false,
    sameSite: 'lax' as const,
  };

  const logging = {
    level: 'info',
    pretty: false,
  };

  const refreshTokenCleanup = {
    retentionDays: 30,
  };

  const verificationTokens = {
    emailConfirmationTtlHours: 48,
    passwordResetTtlMinutes: 60,
    userChangeRequestTtlHours: 48,
  };

  const mail = {
    transport: 'log' as const,
    host: '',
    port: 587,
    secure: false,
    user: '',
    password: '',
    from: '',
    confirmEmailPath: '/confirm-email',
    resetPasswordPath: '/reset-password',
    userChangeRequestPath: '/account/change-requests',
  };

  const emailQuota = {
    passwordResetDailyLimit: 5,
    emailConfirmationDailyLimit: 5,
    userChangeRequestDailyLimit: 5,
    emailChangeNoticeDailyLimit: 5,
  };

  const retentionCleanup = {
    batchSize: 1000,
    passwordResetTokenDays: 7,
    emailConfirmationTokenDays: 7,
    emailSendLogDays: 30,
    emailOutboxDays: 7,
    auditLogDays: 365,
  };

  const emailOutbox = {
    workerEnabled: true,
    pollIntervalMs: 5000,
    maxAttempts: 5,
    retryBaseDelayMs: 60_000,
  };

  const service = new AppConfigService(
    app,
    database,
    jwt,
    cors,
    throttle,
    cookie,
    logging,
    refreshTokenCleanup,
    verificationTokens,
    mail,
    emailQuota,
    retentionCleanup,
    emailOutbox,
  );

  it('exposes each namespaced config through a typed getter', () => {
    expect(service.app).toBe(app);
    expect(service.database).toBe(database);
    expect(service.jwt).toBe(jwt);
    expect(service.cors).toBe(cors);
    expect(service.throttle).toBe(throttle);
    expect(service.cookie).toBe(cookie);
    expect(service.logging).toBe(logging);
    expect(service.refreshTokenCleanup).toBe(refreshTokenCleanup);
    expect(service.verificationTokens).toBe(verificationTokens);
    expect(service.mail).toBe(mail);
    expect(service.emailQuota).toBe(emailQuota);
    expect(service.retentionCleanup).toBe(retentionCleanup);
    expect(service.emailOutbox).toBe(emailOutbox);
  });

  it('exposes the app web URL alongside the other app config fields', () => {
    expect(service.app.webUrl).toBe('http://localhost:5173');
  });
});
