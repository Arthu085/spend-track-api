import { registerAs } from '@nestjs/config';
import { emailQuotaEnvSchema } from '../validation/env.validation';
import { validateEnv } from '../validation/validate-env';

export const emailQuotaConfig = registerAs('emailQuota', () => {
  const env = validateEnv(emailQuotaEnvSchema);

  return {
    passwordResetDailyLimit: env.MAIL_DAILY_LIMIT_PASSWORD_RESET,
    emailConfirmationDailyLimit: env.MAIL_DAILY_LIMIT_EMAIL_CONFIRMATION,
    userChangeRequestDailyLimit: env.MAIL_DAILY_LIMIT_USER_CHANGE_REQUEST,
    emailChangeNoticeDailyLimit: env.MAIL_DAILY_LIMIT_EMAIL_CHANGE_NOTICE,
  };
});
