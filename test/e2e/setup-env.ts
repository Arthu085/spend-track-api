import { readConnection } from '../support/postgres/connection-handoff';
import { ADMIN_CREDENTIALS } from './helpers/auth-agent';
import { E2E_CORS_ORIGIN } from './helpers/cors-origin';

// Runs before each e2e test file (Jest `setupFiles`), in its own worker
// process — reads the connection details `global-setup.ts` published once
// the ephemeral container was fully migrated and seeded, and exposes
// them the same way `AppConfigService` expects to find them. Mirrors
// `test/integration/setup-env.ts`.
const connection = readConnection();

process.env.NODE_ENV = 'test';
process.env.DB_HOST = connection.host;
process.env.DB_PORT = String(connection.port);
process.env.DB_USER = connection.user;
process.env.DB_PASSWORD = connection.password;
process.env.DB_NAME = connection.database;

process.env.JWT_ACCESS_SECRET ??= 'e2e-test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'e2e-test-refresh-secret';
process.env.COOKIE_SECRET ??= 'e2e-test-cookie-secret';
process.env.CORS_ORIGINS = E2E_CORS_ORIGIN;
process.env.SEED_ADMIN_EMAIL = ADMIN_CREDENTIALS.email;
process.env.SEED_ADMIN_PASSWORD = ADMIN_CREDENTIALS.password;

// A local `.env` may point at a Redis only reachable from Compose
// (`redis://redis:6379`), which would fail every app boot. Keep throttling in
// memory; `throttle-redis.e2e-spec.ts` starts and targets its own container.
process.env.THROTTLE_REDIS_URL = '';

// The default daily email quota (5) is too low for the forgot-password and
// create-user calls across one e2e run on a shared container, so raise it.
// Unconditional `=` rather than `??=`: `ConfigModule.forRoot` writes Joi
// defaults back into `process.env`, which would make `??=` a no-op. Specs that
// need a lower limit override it in their own `beforeAll`.
process.env.MAIL_DAILY_LIMIT_PASSWORD_RESET = '100000';
process.env.MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION = '100000';
process.env.MAIL_DAILY_LIMIT_USER_CHANGE_REQUEST = '100000';
process.env.MAIL_DAILY_LIMIT_EMAIL_CHANGE_NOTICE = '100000';

// Every e2e file builds its own app against the one shared database, so an
// outbox worker in one app would deliver another file's emails to its own
// notifier double. Specs deliver their recipients' jobs explicitly with
// `deliverQueuedEmails` instead.
process.env.EMAIL_OUTBOX_WORKER_ENABLED = 'false';
