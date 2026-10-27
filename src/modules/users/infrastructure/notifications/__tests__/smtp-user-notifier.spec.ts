import { I18nService } from 'nestjs-i18n';
import type { AppConfigService } from '@core/config';
import type { MailMessage, MailSenderService } from '@core/mail';
import { SmtpUserNotifier } from '../smtp-user-notifier';

describe('SmtpUserNotifier', () => {
  const config = {
    app: {
      defaultLocale: 'pt-BR',
      webUrl: 'https://app.example.com',
    },
    mail: {
      confirmEmailPath: '/confirm-email',
      resetPasswordPath: '/reset-password',
      userChangeRequestPath: '/account/change-requests',
    },
    verificationTokens: {
      emailConfirmationTtlHours: 48,
      passwordResetTtlMinutes: 60,
      userChangeRequestTtlHours: 24,
    },
  } as unknown as AppConfigService;

  const send = jest
    .fn<Promise<void>, [MailMessage]>()
    .mockResolvedValue(undefined);

  const mailSender = { send } as unknown as MailSenderService;

  const translate = jest.fn((key: string) => key);
  const i18n = { translate } as unknown as I18nService;

  beforeEach(() => {
    jest.clearAllMocks();
    send.mockResolvedValue(undefined);
  });

  const rawToken = 'uu id+with/unsafe=chars ';
  const encodedToken = encodeURIComponent(rawToken);

  describe('sendEmailConfirmation', () => {
    it('sends to the given email with a correctly percent-encoded confirmation URL', async () => {
      const notifier = new SmtpUserNotifier(mailSender, i18n, config);

      await notifier.sendEmailConfirmation({
        email: 'jane@example.com',
        name: 'Jane Doe',
        token: rawToken,
        locale: 'pt-BR',
      });

      expect(send).toHaveBeenCalledTimes(1);

      const [message] = send.mock.calls[0];

      expect(message.to).toBe('jane@example.com');

      const expectedUrl = `https://app.example.com/confirm-email?token=${encodedToken}`;
      expect(message.html).toContain(expectedUrl);
      expect(message.text).toContain(expectedUrl);
    });

    it.each(['en', 'pt-BR'])(
      'renders in the locale carried by the input (%s), not the ambient request',
      async (locale) => {
        const notifier = new SmtpUserNotifier(mailSender, i18n, config);

        await notifier.sendEmailConfirmation({
          email: 'jane@example.com',
          name: 'Jane Doe',
          token: rawToken,
          locale,
        });

        expect(translate).toHaveBeenCalledWith(
          'mail.email_confirmation.subject',
          expect.objectContaining({ lang: locale }),
        );
      },
    );

    it('passes the email-confirmation TTL in hours to the expiry translation', async () => {
      const notifier = new SmtpUserNotifier(mailSender, i18n, config);

      await notifier.sendEmailConfirmation({
        email: 'jane@example.com',
        name: 'Jane Doe',
        token: rawToken,
        locale: 'pt-BR',
      });

      expect(translate).toHaveBeenCalledWith(
        'mail.email_confirmation.expires',
        expect.objectContaining({ args: { hours: 48 } }),
      );
    });

    it('rejects with the transport error so the outbox can retry the job', async () => {
      send.mockRejectedValueOnce(new Error('421 try again later'));

      const notifier = new SmtpUserNotifier(mailSender, i18n, config);

      await expect(
        notifier.sendEmailConfirmation({
          email: 'jane@example.com',
          name: 'Jane Doe',
          token: rawToken,
          locale: 'pt-BR',
        }),
      ).rejects.toThrow('421 try again later');
    });
  });

  describe('sendPasswordReset', () => {
    it('sends to the given email with a correctly percent-encoded reset URL', async () => {
      const notifier = new SmtpUserNotifier(mailSender, i18n, config);

      await notifier.sendPasswordReset({
        email: 'jane@example.com',
        name: 'Jane Doe',
        token: rawToken,
        locale: 'pt-BR',
      });

      expect(send).toHaveBeenCalledTimes(1);

      const [message] = send.mock.calls[0];

      expect(message.to).toBe('jane@example.com');

      const expectedUrl = `https://app.example.com/reset-password?token=${encodedToken}`;
      expect(message.html).toContain(expectedUrl);
      expect(message.text).toContain(expectedUrl);
    });

    it('passes the password-reset TTL in minutes to the expiry translation', async () => {
      const notifier = new SmtpUserNotifier(mailSender, i18n, config);

      await notifier.sendPasswordReset({
        email: 'jane@example.com',
        name: 'Jane Doe',
        token: rawToken,
        locale: 'pt-BR',
      });

      expect(translate).toHaveBeenCalledWith(
        'mail.password_reset.expires',
        expect.objectContaining({ args: { minutes: 60 } }),
      );
    });

    it('rejects with the transport error so the outbox can retry the job', async () => {
      send.mockRejectedValueOnce(new Error('421 try again later'));

      const notifier = new SmtpUserNotifier(mailSender, i18n, config);

      await expect(
        notifier.sendPasswordReset({
          email: 'jane@example.com',
          name: 'Jane Doe',
          token: rawToken,
          locale: 'pt-BR',
        }),
      ).rejects.toThrow('421 try again later');
    });
  });

  describe('sendUserChangeRequest', () => {
    const input = {
      email: 'admin@example.com',
      name: 'Admin',
      locale: 'en',
    };

    it('links to the review page without any token', async () => {
      const notifier = new SmtpUserNotifier(mailSender, i18n, config);

      await notifier.sendUserChangeRequest(input);

      const [message] = send.mock.calls[0];
      const expectedUrl = 'https://app.example.com/account/change-requests';

      expect(message.to).toBe('admin@example.com');
      expect(message.html).toContain(expectedUrl);
      expect(message.text).toContain(expectedUrl);
      expect(message.text).not.toContain('token=');
    });

    it('renders in the job locale with the change-request texts and TTL', async () => {
      const notifier = new SmtpUserNotifier(mailSender, i18n, config);

      await notifier.sendUserChangeRequest(input);

      expect(translate).toHaveBeenCalledWith(
        'mail.user_change_request.subject',
        expect.objectContaining({ lang: 'en' }),
      );
      expect(translate).toHaveBeenCalledWith(
        'mail.user_change_request.expires',
        expect.objectContaining({ args: { hours: 24 } }),
      );
      expect(translate).toHaveBeenCalledWith(
        'mail.user_change_request.ignore',
        expect.objectContaining({ lang: 'en' }),
      );
    });

    it('rejects with the transport error so the outbox can retry the job', async () => {
      send.mockRejectedValueOnce(new Error('421 try again later'));

      const notifier = new SmtpUserNotifier(mailSender, i18n, config);

      await expect(notifier.sendUserChangeRequest(input)).rejects.toThrow(
        '421 try again later',
      );
    });
  });

  describe('sendEmailChangeNotice', () => {
    const input = { email: 'old@example.com', locale: 'en' };

    it('sends the notice in the job locale to the given address, with no link or token', async () => {
      const notifier = new SmtpUserNotifier(mailSender, i18n, config);

      await notifier.sendEmailChangeNotice(input);

      const [message] = send.mock.calls[0];

      expect(message.to).toBe('old@example.com');
      expect(message.subject).toBe('mail.email_change_notice.subject');
      expect(message.text).toContain('mail.email_change_notice.warning');
      expect(message.text).not.toContain('http');
      expect(message.text).not.toContain('token=');
      expect(translate).toHaveBeenCalledWith(
        'mail.email_change_notice.intro',
        expect.objectContaining({ lang: 'en' }),
      );
    });

    it('rejects with the transport error so the outbox can retry the job', async () => {
      send.mockRejectedValueOnce(new Error('421 try again later'));

      const notifier = new SmtpUserNotifier(mailSender, i18n, config);

      await expect(notifier.sendEmailChangeNotice(input)).rejects.toThrow(
        '421 try again later',
      );
    });
  });
});
