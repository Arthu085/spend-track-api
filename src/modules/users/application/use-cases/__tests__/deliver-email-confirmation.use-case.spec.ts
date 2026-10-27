import { EmailType } from '@shared/domain/enums/email-type.enum';
import type {
  EmailJob,
  EmailJobHandlerRegistry,
} from '@shared/application/ports';
import type { UserRepository } from '../../../domain/repositories/user.repository';
import type { IssueEmailConfirmationTokenService } from '../../services/issue-email-confirmation-token.service';
import { DeliverEmailConfirmationUseCase } from '../deliver-email-confirmation.use-case';
import { buildUser } from '@test/support/builders/user.builder';
import { mockOf } from '@test/support/mocks/mock-of';

const JOB: EmailJob = {
  uuid: 'job-uuid',
  emailType: EmailType.EMAIL_CONFIRMATION,
  recipient: 'jane@example.com',
  locale: 'en',
  attempt: 1,
};

function buildDeps(findByEmail: jest.Mock, issueFor?: jest.Mock) {
  const issue = issueFor ?? jest.fn().mockResolvedValue(undefined);
  const register = jest.fn();

  const useCase = new DeliverEmailConfirmationUseCase(
    mockOf<UserRepository>({ findByEmail }),
    mockOf<IssueEmailConfirmationTokenService>({ issueFor: issue }),
    mockOf<EmailJobHandlerRegistry>({ register }),
  );

  return { useCase, issueFor: issue, register };
}

describe('DeliverEmailConfirmationUseCase', () => {
  it('registers itself as the EMAIL_CONFIRMATION job handler', () => {
    const { useCase, register } = buildDeps(jest.fn());

    useCase.onModuleInit();

    expect(register).toHaveBeenCalledWith(
      EmailType.EMAIL_CONFIRMATION,
      useCase,
    );
  });

  it('issues and sends a confirmation in the job locale for an unconfirmed account', async () => {
    const user = buildUser({ emailConfirmedAt: null });
    const findByEmail = jest.fn().mockResolvedValue(user);
    const { useCase, issueFor } = buildDeps(findByEmail);

    await useCase.handle(JOB);

    expect(findByEmail).toHaveBeenCalledWith(JOB.recipient);
    expect(issueFor).toHaveBeenCalledWith(user.id, JOB);
  });

  it.each([
    ['no account owns the address', null],
    [
      'the account is already confirmed',
      buildUser({ emailConfirmedAt: new Date() }),
    ],
  ])('completes as a no-op when %s', async (_, user) => {
    const { useCase, issueFor } = buildDeps(jest.fn().mockResolvedValue(user));

    await expect(useCase.handle(JOB)).resolves.toBeUndefined();
    expect(issueFor).not.toHaveBeenCalled();
  });

  it('propagates a delivery failure so the outbox retries the job', async () => {
    const { useCase } = buildDeps(
      jest.fn().mockResolvedValue(buildUser({ emailConfirmedAt: null })),
      jest.fn().mockRejectedValue(new Error('smtp down')),
    );

    await expect(useCase.handle(JOB)).rejects.toThrow('smtp down');
  });
});
