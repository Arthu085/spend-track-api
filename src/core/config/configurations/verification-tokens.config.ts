import { registerAs } from '@nestjs/config';
import { verificationTokensEnvSchema } from '../validation/env.validation';
import { validateEnv } from '../validation/validate-env';

export const verificationTokensConfig = registerAs('verificationTokens', () => {
  const env = validateEnv(verificationTokensEnvSchema);

  return {
    emailConfirmationTtlHours: env.EMAIL_CONFIRMATION_TOKEN_TTL_HOURS,
    passwordResetTtlMinutes: env.PASSWORD_RESET_TOKEN_TTL_MINUTES,
    userChangeRequestTtlHours: env.USER_CHANGE_REQUEST_TTL_HOURS,
  };
});
