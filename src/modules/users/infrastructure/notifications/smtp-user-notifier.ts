import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppConfigService } from '@core/config';
import { MailSenderService } from '@core/mail';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import {
  type SendEmailChangeNoticeInput,
  type SendEmailConfirmationInput,
  type SendPasswordResetInput,
  type SendUserChangeRequestInput,
  type UserNotifier,
} from '../../application/ports/user-notifier.port';
import { renderActionEmail } from './templates/action-email.template';
import { renderNoticeEmail } from './templates/notice-email.template';

type ActionEmailInput = SendEmailConfirmationInput | SendPasswordResetInput;

type TokenEmailType = EmailType.EMAIL_CONFIRMATION | EmailType.PASSWORD_RESET;

interface ActionEmailDefinition {
  translationPrefix: string;
  path: (config: AppConfigService) => string;
  expiryArgs: (config: AppConfigService) => Record<string, number>;
}

const ACTION_EMAILS: Record<TokenEmailType, ActionEmailDefinition> = {
  [EmailType.EMAIL_CONFIRMATION]: {
    translationPrefix: 'mail.email_confirmation',
    path: (config) => config.mail.confirmEmailPath,
    expiryArgs: (config) => ({
      hours: config.verificationTokens.emailConfirmationTtlHours,
    }),
  },
  [EmailType.PASSWORD_RESET]: {
    translationPrefix: 'mail.password_reset',
    path: (config) => config.mail.resetPasswordPath,
    expiryArgs: (config) => ({
      minutes: config.verificationTokens.passwordResetTtlMinutes,
    }),
  },
};

@Injectable()
export class SmtpUserNotifier implements UserNotifier {
  constructor(
    private readonly mailSender: MailSenderService,
    private readonly i18n: I18nService,
    private readonly config: AppConfigService,
  ) {}

  sendEmailConfirmation(input: SendEmailConfirmationInput): Promise<void> {
    return this.sendActionEmail(EmailType.EMAIL_CONFIRMATION, input);
  }

  sendPasswordReset(input: SendPasswordResetInput): Promise<void> {
    return this.sendActionEmail(EmailType.PASSWORD_RESET, input);
  }

  async sendUserChangeRequest(
    input: SendUserChangeRequestInput,
  ): Promise<void> {
    const translationPrefix = 'mail.user_change_request';
    const lang = input.locale;

    const subject = this.i18n.translate(`${translationPrefix}.subject`, {
      lang,
    });

    const { html, text } = renderActionEmail({
      heading: subject,
      greeting: this.i18n.translate('mail.common.greeting', {
        lang,
        args: { name: input.name },
      }),
      intro: this.i18n.translate(`${translationPrefix}.intro`, { lang }),
      ctaLabel: this.i18n.translate(`${translationPrefix}.cta`, { lang }),
      ctaUrl: `${this.config.app.webUrl}${this.config.mail.userChangeRequestPath}`,
      expiryNotice: this.i18n.translate(`${translationPrefix}.expires`, {
        lang,
        args: {
          hours: this.config.verificationTokens.userChangeRequestTtlHours,
        },
      }),
      fallbackNotice: this.i18n.translate('mail.common.fallback_link', {
        lang,
      }),
      ignoreNotice: this.i18n.translate(`${translationPrefix}.ignore`, {
        lang,
      }),
      footer: this.i18n.translate('mail.common.footer', { lang }),
    });

    await this.mailSender.send({ to: input.email, subject, html, text });
  }

  async sendEmailChangeNotice(
    input: SendEmailChangeNoticeInput,
  ): Promise<void> {
    const translationPrefix = 'mail.email_change_notice';
    const lang = input.locale;

    const subject = this.i18n.translate(`${translationPrefix}.subject`, {
      lang,
    });

    const { html, text } = renderNoticeEmail({
      heading: subject,
      intro: this.i18n.translate(`${translationPrefix}.intro`, { lang }),
      warning: this.i18n.translate(`${translationPrefix}.warning`, { lang }),
      footer: this.i18n.translate('mail.common.footer', { lang }),
    });

    await this.mailSender.send({ to: input.email, subject, html, text });
  }

  private async sendActionEmail(
    kind: TokenEmailType,
    input: ActionEmailInput,
  ): Promise<void> {
    const { translationPrefix, path, expiryArgs } = ACTION_EMAILS[kind];
    const lang = input.locale;

    const subject = this.i18n.translate(`${translationPrefix}.subject`, {
      lang,
    });

    const ctaUrl = `${this.config.app.webUrl}${path(this.config)}?token=${encodeURIComponent(input.token)}`;

    const { html, text } = renderActionEmail({
      heading: subject,
      greeting: this.i18n.translate('mail.common.greeting', {
        lang,
        args: { name: input.name },
      }),
      intro: this.i18n.translate(`${translationPrefix}.intro`, { lang }),
      ctaLabel: this.i18n.translate(`${translationPrefix}.cta`, { lang }),
      ctaUrl,
      expiryNotice: this.i18n.translate(`${translationPrefix}.expires`, {
        lang,
        args: expiryArgs(this.config),
      }),
      fallbackNotice: this.i18n.translate('mail.common.fallback_link', {
        lang,
      }),
      ignoreNotice: this.i18n.translate('mail.common.ignore', { lang }),
      footer: this.i18n.translate('mail.common.footer', { lang }),
    });

    await this.mailSender.send({ to: input.email, subject, html, text });
  }
}
