import { EmailType } from '@shared/domain/enums/email-type.enum';
import type {
  EmailOutboxPort,
  ScheduleEmailResult,
} from '@shared/application/ports';
import { ResendEmailConfirmationUseCase } from '../resend-email-confirmation.use-case';
import { mockOf } from '@test/support/mocks/mock-of';

function buildUseCase(result: ScheduleEmailResult) {
  const schedule = jest.fn().mockResolvedValue(result);

  const useCase = new ResendEmailConfirmationUseCase(
    mockOf<EmailOutboxPort>({ schedule }),
  );

  return { useCase, schedule };
}

describe('ResendEmailConfirmationUseCase', () => {
  it('schedules a EMAIL_CONFIRMATION email for the submitted address without looking up the account', async () => {
    const { useCase, schedule } = buildUseCase({ scheduled: true });

    await expect(
      useCase.execute({ email: '  Jane@Example.COM ' }),
    ).resolves.toBeUndefined();

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith({
      emailType: EmailType.EMAIL_CONFIRMATION,
      recipient: '  Jane@Example.COM ',
    });
  });

  it.each(['DISABLED', 'EXHAUSTED', 'UNAVAILABLE'] as const)(
    'resolves the same way when scheduling is denied with reason %s (anti-enumeration)',
    async (reason) => {
      const { useCase } = buildUseCase({ scheduled: false, reason });

      await expect(
        useCase.execute({ email: 'jane@example.com' }),
      ).resolves.toBeUndefined();
    },
  );
});
