import { EmailType } from '@shared/domain/enums/email-type.enum';
import type {
  EmailJob,
  EmailJobHandlerRegistry,
} from '@shared/application/ports';
import { mockOf } from '@test/support/mocks/mock-of';
import type { UserNotifier } from '../../ports/user-notifier.port';
import { DeliverEmailChangeNoticeUseCase } from '../deliver-email-change-notice.use-case';

function buildHarness(sendEmailChangeNotice = jest.fn()) {
  const register = jest.fn();

  const useCase = new DeliverEmailChangeNoticeUseCase(
    mockOf<UserNotifier>({ sendEmailChangeNotice }),
    mockOf<EmailJobHandlerRegistry>({ register }),
  );

  return { useCase, register, sendEmailChangeNotice };
}

describe('DeliverEmailChangeNoticeUseCase', () => {
  it('registers itself for EMAIL_CHANGE_NOTICE jobs', () => {
    const { useCase, register } = buildHarness();

    useCase.onModuleInit();

    expect(register).toHaveBeenCalledWith(
      EmailType.EMAIL_CHANGE_NOTICE,
      useCase,
    );
  });

  // The recipient is the replaced address, which no longer belongs to any
  // account, so the notice is sent without an account lookup.
  it('sends the notice to the job recipient in the job locale', async () => {
    const { useCase, sendEmailChangeNotice } = buildHarness(
      jest.fn().mockResolvedValue(undefined),
    );

    await useCase.handle({
      recipient: 'old@example.com',
      locale: 'en',
    } as EmailJob);

    expect(sendEmailChangeNotice).toHaveBeenCalledWith({
      email: 'old@example.com',
      locale: 'en',
    });
  });

  it('rejects with the notifier error so the outbox retries the job', async () => {
    const { useCase } = buildHarness(
      jest.fn().mockRejectedValue(new Error('smtp down')),
    );

    await expect(
      useCase.handle({
        recipient: 'old@example.com',
        locale: 'en',
      } as EmailJob),
    ).rejects.toThrow('smtp down');
  });
});
