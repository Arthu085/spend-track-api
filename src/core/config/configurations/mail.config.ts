import { registerAs } from '@nestjs/config';
import { mailEnvSchema } from '../validation/env.validation';
import { validateEnv } from '../validation/validate-env';

export const mailConfig = registerAs('mail', () => {
  const env = validateEnv(mailEnvSchema);

  return {
    transport: env.MAIL_TRANSPORT,
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    secure: env.MAIL_SECURE,
    user: env.MAIL_USER,
    password: env.MAIL_PASSWORD,
    from: env.MAIL_FROM,
    confirmEmailPath: env.MAIL_CONFIRM_EMAIL_PATH,
    resetPasswordPath: env.MAIL_RESET_PASSWORD_PATH,
    userChangeRequestPath: env.MAIL_USER_CHANGE_REQUEST_PATH,
  };
});
