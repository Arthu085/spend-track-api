import { readConnection } from '../support/postgres/connection-handoff';

// Runs before each integration test file (Jest `setupFiles`), in its own
// worker process — reads the connection details globalSetup published
// and exposes them the same way `AppConfigService` expects to find them.
const connection = readConnection();

process.env.NODE_ENV = 'test';
process.env.DB_HOST = connection.host;
process.env.DB_PORT = String(connection.port);
process.env.DB_USER = connection.user;
process.env.DB_PASSWORD = connection.password;
process.env.DB_NAME = connection.database;

process.env.JWT_ACCESS_SECRET ??= 'integration-test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'integration-test-refresh-secret';
process.env.COOKIE_SECRET ??= 'integration-test-cookie-secret';

process.env.SEED_ADMIN_EMAIL = 'seed-admin@example.com';
process.env.SEED_ADMIN_PASSWORD = 'Integration-test-password1';
