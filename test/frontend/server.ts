import 'tsconfig-paths/register';
import type { NestExpressApplication } from '@nestjs/platform-express';
import globalSetup from '../e2e/global-setup';
import globalTeardown from '../e2e/global-teardown';
import { ADMIN_CREDENTIALS, USER_CREDENTIALS } from '../e2e/helpers/auth-agent';

let app: NestExpressApplication | undefined;
let shutdownTask: Promise<void> | undefined;

async function start(): Promise<void> {
  if (!process.send) {
    throw new Error(
      'Start this fixture through the frontend integration suite.',
    );
  }

  await globalSetup();
  await import('../e2e/setup-env.js');

  process.env.CORS_ORIGINS = 'http://localhost:5173';
  process.env.APP_WEB_URL = 'http://localhost:5173';
  process.env.JWT_ACCESS_TTL = '2s';
  process.env.COOKIE_SECURE = 'false';
  process.env.COOKIE_SAMESITE = 'lax';
  process.env.COOKIE_DOMAIN = '';
  process.env.MAIL_TRANSPORT = 'log';
  process.env.LOG_PRETTY = 'false';
  process.env.LOG_LEVEL = 'silent';
  process.env.AUTH_THROTTLE_LIMIT = '1000';
  process.env.THROTTLE_LIMIT = '1000';

  const { createTestApp } = await import('../e2e/helpers/create-test-app.js');

  app = await createTestApp();
  await app.listen(0, 'localhost');

  const address = new URL(await app.getUrl());

  address.hostname = 'localhost';

  if (process.connected) {
    process.send({
      type: 'ready',
      baseURL: `${address.origin}/api`,
      admin: ADMIN_CREDENTIALS,
      user: USER_CREDENTIALS,
    });
  }
}

const startup = start();

function stop(): void {
  shutdownTask ??= startup
    .catch(() => undefined)
    .then(async () => {
      try {
        await app?.close();
      } finally {
        await globalTeardown();
      }
    });

  shutdownTask
    .then(() => {
      if (process.connected) {
        process.disconnect();
      }
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}

process.on('disconnect', stop);
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

startup.catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
  stop();
});
