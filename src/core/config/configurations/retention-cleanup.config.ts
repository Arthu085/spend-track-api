import { registerAs } from '@nestjs/config';
import { retentionCleanupEnvSchema } from '../validation/env.validation';
import { validateEnv } from '../validation/validate-env';

export const retentionCleanupConfig = registerAs('retentionCleanup', () => {
  const env = validateEnv(retentionCleanupEnvSchema);

  return {
    batchSize: env.RETENTION_CLEANUP_BATCH_SIZE,
    passwordResetTokenDays: env.PASSWORD_RESET_TOKEN_RETENTION_DAYS,
    emailConfirmationTokenDays: env.EMAIL_CONFIRMATION_TOKEN_RETENTION_DAYS,
    emailSendLogDays: env.EMAIL_SEND_LOG_RETENTION_DAYS,
    emailOutboxDays: env.EMAIL_OUTBOX_RETENTION_DAYS,
    auditLogDays: env.AUDIT_LOG_RETENTION_DAYS,
  };
});
