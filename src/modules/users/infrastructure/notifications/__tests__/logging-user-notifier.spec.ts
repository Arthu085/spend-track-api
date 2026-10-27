import { Logger } from '@nestjs/common';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import { LoggingUserNotifier } from '../logging-user-notifier';

describe('LoggingUserNotifier', () => {
  const input = {
    email: 'jane@example.com',
    name: 'Jane Doe',
    token: 'uuid.secret',
    locale: 'pt-BR',
  };

  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs the email-confirmation token with a masked recipient instead of sending a real email', async () => {
    await new LoggingUserNotifier().sendEmailConfirmation(input);

    expect(logSpy).toHaveBeenCalledWith({
      msg: 'Email token issued',
      emailType: EmailType.EMAIL_CONFIRMATION,
      recipient: 'j***@example.com',
      token: 'uuid.secret',
    });
  });

  it('logs the password-reset token with a masked recipient instead of sending a real email', async () => {
    await new LoggingUserNotifier().sendPasswordReset(input);

    expect(logSpy).toHaveBeenCalledWith({
      msg: 'Email token issued',
      emailType: EmailType.PASSWORD_RESET,
      recipient: 'j***@example.com',
      token: 'uuid.secret',
    });
  });

  it('logs a change-request notification with a masked recipient', async () => {
    await new LoggingUserNotifier().sendUserChangeRequest(input);

    expect(logSpy).toHaveBeenCalledWith({
      msg: 'Change request notification issued',
      emailType: EmailType.USER_CHANGE_REQUEST,
      recipient: 'j***@example.com',
    });
  });

  it('logs an email-change notice with a masked recipient', async () => {
    await new LoggingUserNotifier().sendEmailChangeNotice(input);

    expect(logSpy).toHaveBeenCalledWith({
      msg: 'Email change notice issued',
      emailType: EmailType.EMAIL_CHANGE_NOTICE,
      recipient: 'j***@example.com',
    });
  });

  it('never logs the raw recipient email or the recipient name', async () => {
    await new LoggingUserNotifier().sendEmailConfirmation(input);
    await new LoggingUserNotifier().sendPasswordReset(input);
    await new LoggingUserNotifier().sendUserChangeRequest(input);
    await new LoggingUserNotifier().sendEmailChangeNotice(input);

    const logged = JSON.stringify(logSpy.mock.calls);

    expect(logged).not.toContain('jane@example.com');
    expect(logged).not.toContain('Jane Doe');
  });
});
