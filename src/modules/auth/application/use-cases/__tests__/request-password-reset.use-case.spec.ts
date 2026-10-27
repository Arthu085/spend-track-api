import { EmailType } from '@shared/domain/enums/email-type.enum';
import type {
  EmailOutboxPort,
  ScheduleEmailResult,
} from '@shared/application/ports';
import { RequestPasswordResetUseCase } from '../request-password-reset.use-case';
import { mockOf } from '@test/support/mocks/mock-of';

function buildUseCase(result: ScheduleEmailResult) {
  const schedule = jest.fn().mockResolvedValue(result);

  const useCase = new RequestPasswordResetUseCase(
    mockOf<EmailOutboxPort>({ schedule }),
  );

  return { useCase, schedule };
}

describe('RequestPasswordResetUseCase', () => {
  it('schedules a PASSWORD_RESET email for the submitted address without looking up the account', async () => {
    const { useCase, schedule } = buildUseCase({ scheduled: true });

    await expect(
      useCase.execute({ email: '  Jane@Example.COM ' }),
    ).resolves.toBeUndefined();

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith({
      emailType: EmailType.PASSWORD_RESET,
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
