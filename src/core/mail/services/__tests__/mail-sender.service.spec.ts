import * as nodemailer from 'nodemailer';
import type { AppConfigService } from '@core/config';
import type { MailMessage } from '../../types/mail-message.type';
import { MailSenderService } from '../mail-sender.service';

jest.mock('nodemailer');

describe('MailSenderService', () => {
  const mailConfig = {
    transport: 'smtp' as const,
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    user: '',
    password: '',
    from: 'App <no-reply@example.com>',
    confirmEmailPath: '/confirm-email',
    resetPasswordPath: '/reset-password',
  };

  const buildConfig = (
    overrides: Partial<typeof mailConfig> = {},
  ): AppConfigService =>
    ({ mail: { ...mailConfig, ...overrides } }) as unknown as AppConfigService;

  const message: MailMessage = {
    to: 'jane@example.com',
    subject: 'Confirm your email',
    html: '<p>hi</p>',
    text: 'hi',
  };

  const sendMail = jest.fn().mockResolvedValue(undefined);
  const close = jest.fn();
  const createTransport = jest.mocked(nodemailer.createTransport);

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail.mockResolvedValue(undefined);
    createTransport.mockReturnValue({
      sendMail,
      close,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);
  });

  it('does not create a transporter during construction', () => {
    new MailSenderService(buildConfig());

    expect(createTransport).not.toHaveBeenCalled();
  });

  it('creates the transporter lazily on first send and reuses it afterwards', async () => {
    const service = new MailSenderService(buildConfig());

    await service.send(message);
    await service.send(message);

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
    );
  });

  it('omits the auth option when user/password are empty strings', async () => {
    const service = new MailSenderService(
      buildConfig({ user: '', password: '' }),
    );

    await service.send(message);

    const options = createTransport.mock.calls[0][0] as Record<string, unknown>;

    expect(options.auth).toBeUndefined();
  });

  it('includes the auth option when both user and password are set', async () => {
    const service = new MailSenderService(
      buildConfig({ user: 'smtp-user', password: 'smtp-pass' }),
    );

    await service.send(message);

    const options = createTransport.mock.calls[0][0] as Record<string, unknown>;

    expect(options.auth).toEqual({ user: 'smtp-user', pass: 'smtp-pass' });
  });

  it('sends the message using the configured from address', async () => {
    const service = new MailSenderService(buildConfig());

    await service.send(message);

    expect(sendMail).toHaveBeenCalledWith({
      from: mailConfig.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  });

  it('propagates a rejection from sendMail instead of swallowing it', async () => {
    sendMail.mockRejectedValueOnce(new Error('smtp connection refused'));
    const service = new MailSenderService(buildConfig());

    await expect(service.send(message)).rejects.toThrow(
      'smtp connection refused',
    );
  });

  describe('onModuleDestroy', () => {
    it('closes the transporter when one was created', async () => {
      const service = new MailSenderService(buildConfig());
      await service.send(message);

      service.onModuleDestroy();

      expect(close).toHaveBeenCalledTimes(1);
    });

    it('does nothing when no transporter was ever created', () => {
      const service = new MailSenderService(buildConfig());

      service.onModuleDestroy();

      expect(close).not.toHaveBeenCalled();
    });
  });
});
