import { registerAs } from '@nestjs/config';
import { SECOND_IN_MS } from '@shared/application/time';
import { emailOutboxEnvSchema } from '../validation/env.validation';
import { validateEnv } from '../validation/validate-env';

export const emailOutboxConfig = registerAs('emailOutbox', () => {
  const env = validateEnv(emailOutboxEnvSchema);

  return {
    workerEnabled: env.EMAIL_OUTBOX_WORKER_ENABLED,
    pollIntervalMs: env.EMAIL_OUTBOX_POLL_INTERVAL_MS,
    maxAttempts: env.EMAIL_OUTBOX_MAX_ATTEMPTS,
    retryBaseDelayMs: env.EMAIL_OUTBOX_RETRY_BASE_DELAY_SECONDS * SECOND_IN_MS,
  };
});
