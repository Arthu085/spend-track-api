import { Injectable, Logger } from '@nestjs/common';
import { maskEmail } from '@shared/application/logging';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import {
  type SendEmailChangeNoticeInput,
  type SendEmailConfirmationInput,
  type SendPasswordResetInput,
  type SendUserChangeRequestInput,
  type UserNotifier,
} from '../../application/ports/user-notifier.port';

@Injectable()
export class LoggingUserNotifier implements UserNotifier {
  private readonly logger = new Logger(LoggingUserNotifier.name);

  sendEmailConfirmation(input: SendEmailConfirmationInput): Promise<void> {
    this.logToken(EmailType.EMAIL_CONFIRMATION, input.email, input.token);

    return Promise.resolve();
  }

  sendPasswordReset(input: SendPasswordResetInput): Promise<void> {
    this.logToken(EmailType.PASSWORD_RESET, input.email, input.token);

    return Promise.resolve();
  }

  sendUserChangeRequest(input: SendUserChangeRequestInput): Promise<void> {
    this.logger.log({
      msg: 'Change request notification issued',
      emailType: EmailType.USER_CHANGE_REQUEST,
      recipient: maskEmail(input.email),
    });

    return Promise.resolve();
  }

  sendEmailChangeNotice(input: SendEmailChangeNoticeInput): Promise<void> {
    this.logger.log({
      msg: 'Email change notice issued',
      emailType: EmailType.EMAIL_CHANGE_NOTICE,
      recipient: maskEmail(input.email),
    });

    return Promise.resolve();
  }

  private logToken(emailType: EmailType, recipient: string, token: string) {
    this.logger.log({
      msg: 'Email token issued',
      emailType,
      recipient: maskEmail(recipient),
      token,
    });
  }
}
