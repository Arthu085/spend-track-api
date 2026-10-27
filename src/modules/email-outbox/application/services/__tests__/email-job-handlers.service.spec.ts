import { EmailType } from '@shared/domain/enums/email-type.enum';
import type { EmailJobHandler } from '@shared/application/ports';
import { EmailJobHandlers } from '../email-job-handlers.service';
import { mockOf } from '@test/support/mocks/mock-of';

describe('EmailJobHandlers', () => {
  it('resolves the handler registered for an email type', () => {
    const handlers = new EmailJobHandlers();
    const handler = mockOf<EmailJobHandler>({ handle: jest.fn() });

    handlers.register(EmailType.PASSWORD_RESET, handler);

    expect(handlers.resolve(EmailType.PASSWORD_RESET)).toBe(handler);
    expect(handlers.resolve(EmailType.EMAIL_CONFIRMATION)).toBeUndefined();
  });

  it('rejects a second handler for the same email type', () => {
    const handlers = new EmailJobHandlers();

    handlers.register(
      EmailType.PASSWORD_RESET,
      mockOf<EmailJobHandler>({ handle: jest.fn() }),
    );

    expect(() =>
      handlers.register(
        EmailType.PASSWORD_RESET,
        mockOf<EmailJobHandler>({ handle: jest.fn() }),
      ),
    ).toThrow(
      `An email job handler for ${EmailType.PASSWORD_RESET} is already registered`,
    );
  });
});
