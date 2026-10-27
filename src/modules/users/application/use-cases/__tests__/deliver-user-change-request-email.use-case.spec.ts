import { EmailType } from '@shared/domain/enums/email-type.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import type {
  EmailJob,
  EmailJobHandlerRegistry,
} from '@shared/application/ports';
import { buildUser } from '@test/support/builders/user.builder';
import { buildUserChangeRequest } from '@test/support/builders/user-change-request.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { UserEntity } from '../../../domain/entities/user.entity';
import type { UserChangeRequestEntity } from '../../../domain/entities/user-change-request.entity';
import type { UserChangeRequestRepository } from '../../../domain/repositories/user-change-request.repository';
import type { UserRepository } from '../../../domain/repositories/user.repository';
import type { UserNotifier } from '../../ports/user-notifier.port';
import { DeliverUserChangeRequestEmailUseCase } from '../deliver-user-change-request-email.use-case';

const job = {
  recipient: 'admin@example.com',
  locale: 'en',
} as EmailJob;

function buildHarness(
  user: UserEntity | null,
  pending: UserChangeRequestEntity[],
) {
  const sendUserChangeRequest = jest.fn().mockResolvedValue(undefined);
  const register = jest.fn();

  const useCase = new DeliverUserChangeRequestEmailUseCase(
    mockOf<UserRepository>({
      findByEmail: jest.fn().mockResolvedValue(user),
    }),
    mockOf<UserChangeRequestRepository>({
      findPendingForUser: jest.fn().mockResolvedValue(pending),
    }),
    mockOf<UserNotifier>({ sendUserChangeRequest }),
    mockOf<EmailJobHandlerRegistry>({ register }),
  );

  return { useCase, sendUserChangeRequest, register };
}

describe('DeliverUserChangeRequestEmailUseCase', () => {
  const admin = buildUser({
    id: 7,
    name: 'Admin',
    email: 'admin@example.com',
  });

  it('registers itself for USER_CHANGE_REQUEST jobs', () => {
    const { useCase, register } = buildHarness(admin, []);

    useCase.onModuleInit();

    expect(register).toHaveBeenCalledWith(
      EmailType.USER_CHANGE_REQUEST,
      useCase,
    );
  });

  it('notifies the recipient in the job locale while a request is pending', async () => {
    const { useCase, sendUserChangeRequest } = buildHarness(admin, [
      buildUserChangeRequest({ targetUserId: 7 }),
    ]);

    await useCase.handle(job);

    expect(sendUserChangeRequest).toHaveBeenCalledWith({
      email: 'admin@example.com',
      name: 'Admin',
      locale: 'en',
    });
  });

  it.each([
    { scenario: 'no account owns the address', user: null, pending: 1 },
    {
      scenario: 'the account is inactive',
      user: buildUser({ status: RecordStatus.INACTIVE }),
      pending: 1,
    },
    { scenario: 'nothing is pending anymore', user: admin, pending: 0 },
  ])('sends nothing when $scenario', async ({ user, pending }) => {
    const { useCase, sendUserChangeRequest } = buildHarness(
      user,
      Array.from({ length: pending }, () => buildUserChangeRequest()),
    );

    await useCase.handle(job);

    expect(sendUserChangeRequest).not.toHaveBeenCalled();
  });
});
