import type { AppConfigService } from '@core/config';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import type {
  EmailJob,
  EmailJobHandlerRegistry,
  TokenHasher,
  TransactionManagerPort,
} from '@shared/application/ports';
import { OneTimeToken } from '@shared/application/tokens';
import type { UserRepository } from '@modules/users/domain/repositories/user.repository';
import type { UserNotifier } from '@modules/users/application/ports/user-notifier.port';
import { PasswordResetTokenEntity } from '../../../domain/entities/password-reset-token.entity';
import type { PasswordResetTokenRepository } from '../../../domain/repositories/password-reset-token.repository';
import { DeliverPasswordResetEmailUseCase } from '../deliver-password-reset-email.use-case';
import { buildUser } from '@test/support/builders/user.builder';
import { mockOf } from '@test/support/mocks/mock-of';

const JOB: EmailJob = {
  uuid: 'job-uuid',
  emailType: EmailType.PASSWORD_RESET,
  recipient: 'jane@example.com',
  locale: 'en',
  attempt: 1,
};

function buildDeps(
  overrides: {
    findByEmail?: jest.Mock;
    findByIdForUpdate?: jest.Mock;
    sendPasswordReset?: jest.Mock;
  } = {},
) {
  const events: string[] = [];

  const findByEmail =
    overrides.findByEmail ?? jest.fn().mockResolvedValue(buildUser());

  // The row re-read under lock inside the issuing transaction; by default
  // unchanged since the lookup.
  const findByIdForUpdate =
    overrides.findByIdForUpdate ?? jest.fn().mockResolvedValue(buildUser());

  const consumeAllForUser = jest.fn().mockResolvedValue(undefined);

  const create = jest
    .fn()
    .mockImplementation((entity: PasswordResetTokenEntity) =>
      Promise.resolve(entity),
    );

  const hash = jest.fn().mockReturnValue('hashed-secret');

  const sendPasswordReset =
    overrides.sendPasswordReset ??
    jest.fn().mockImplementation(() => {
      events.push('notify');
      return Promise.resolve();
    });

  const runInTransaction = jest
    .fn()
    .mockImplementation(async (work: () => Promise<unknown>) => {
      const result = await work();
      events.push('commit');
      return result;
    });

  const register = jest.fn();

  const useCase = new DeliverPasswordResetEmailUseCase(
    mockOf<UserRepository>({ findByEmail, findByIdForUpdate }),
    mockOf<PasswordResetTokenRepository>({ create, consumeAllForUser }),
    mockOf<TokenHasher>({ hash }),
    mockOf<UserNotifier>({ sendPasswordReset }),
    mockOf<TransactionManagerPort>({ runInTransaction }),
    mockOf<EmailJobHandlerRegistry>({ register }),
    mockOf<AppConfigService>({
      verificationTokens: {
        emailConfirmationTtlHours: 48,
        passwordResetTtlMinutes: 60,
        userChangeRequestTtlHours: 48,
      },
    }),
  );

  return {
    useCase,
    events,
    findByEmail,
    findByIdForUpdate,
    consumeAllForUser,
    create,
    hash,
    sendPasswordReset,
    runInTransaction,
    register,
  };
}

describe('DeliverPasswordResetEmailUseCase', () => {
  it('registers itself as the PASSWORD_RESET job handler', () => {
    const { useCase, register } = buildDeps();

    useCase.onModuleInit();

    expect(register).toHaveBeenCalledWith(EmailType.PASSWORD_RESET, useCase);
  });

  it('completes as a no-op for an address with no account', async () => {
    const { useCase, create, sendPasswordReset } = buildDeps({
      findByEmail: jest.fn().mockResolvedValue(null),
    });

    await expect(useCase.handle(JOB)).resolves.toBeUndefined();

    expect(create).not.toHaveBeenCalled();
    expect(sendPasswordReset).not.toHaveBeenCalled();
  });

  it('completes as a no-op for an INACTIVE account', async () => {
    const { useCase, create, sendPasswordReset } = buildDeps({
      findByEmail: jest
        .fn()
        .mockResolvedValue(buildUser({ status: RecordStatus.INACTIVE })),
    });

    await useCase.handle(JOB);

    expect(create).not.toHaveBeenCalled();
    expect(sendPasswordReset).not.toHaveBeenCalled();
  });

  it('locks the user, supersedes earlier tokens and persists a new one in a transaction, then emails it in the job locale', async () => {
    const current = buildUser({ id: 9, name: 'Jane Renamed' });

    const {
      useCase,
      events,
      findByEmail,
      findByIdForUpdate,
      consumeAllForUser,
      create,
      sendPasswordReset,
      runInTransaction,
    } = buildDeps({
      findByEmail: jest.fn().mockResolvedValue(buildUser({ id: 9 })),
      findByIdForUpdate: jest.fn().mockResolvedValue(current),
    });

    await useCase.handle(JOB);

    expect(findByEmail).toHaveBeenCalledWith(JOB.recipient);
    expect(runInTransaction).toHaveBeenCalledTimes(1);
    expect(findByIdForUpdate).toHaveBeenCalledWith(9);
    expect(findByIdForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      consumeAllForUser.mock.invocationCallOrder[0],
    );
    expect(consumeAllForUser).toHaveBeenCalledWith(9);
    expect(consumeAllForUser.mock.invocationCallOrder[0]).toBeLessThan(
      create.mock.invocationCallOrder[0],
    );
    expect(events).toEqual(['commit', 'notify']);
    expect(sendPasswordReset).toHaveBeenCalledWith({
      email: current.email,
      name: 'Jane Renamed',
      token: expect.any(String) as string,
      locale: 'en',
    });
  });

  it.each([
    {
      scenario: 'the email no longer matches the job recipient',
      current: buildUser({ email: 'jane.new@example.com' }),
    },
    {
      scenario: 'the user was deactivated',
      current: buildUser({ status: RecordStatus.INACTIVE }),
    },
    { scenario: 'the user is gone', current: null },
  ])(
    'issues and sends nothing when, under the row lock, $scenario',
    async ({ current }) => {
      const { useCase, consumeAllForUser, create, sendPasswordReset } =
        buildDeps({ findByIdForUpdate: jest.fn().mockResolvedValue(current) });

      await expect(useCase.handle(JOB)).resolves.toBeUndefined();

      expect(consumeAllForUser).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(sendPasswordReset).not.toHaveBeenCalled();
    },
  );

  it('persists only the hash of the emailed secret, with an expiry from the configured TTL', async () => {
    const { useCase, create, hash, sendPasswordReset } = buildDeps();

    const before = Date.now();
    await useCase.handle(JOB);

    const [notifierInput] = sendPasswordReset.mock.calls[0] as [
      { token: string },
    ];

    const sentToken = OneTimeToken.parse(notifierInput.token);
    const [persisted] = create.mock.calls[0] as [PasswordResetTokenEntity];

    expect(hash).toHaveBeenCalledWith(sentToken?.secret);
    expect(persisted.uuid).toBe(sentToken?.uuid);
    expect(persisted.tokenHash).toBe('hashed-secret');
    expect(persisted.expiresAt.getTime() - before).toBeGreaterThanOrEqual(
      60 * 60 * 1000,
    );
  });

  it('mints a fresh token on every attempt, so a duplicate delivery leaves only the latest link usable', async () => {
    const { useCase, consumeAllForUser, sendPasswordReset } = buildDeps();

    await useCase.handle(JOB);
    await useCase.handle({ ...JOB, attempt: 2 });

    const tokens = (
      sendPasswordReset.mock.calls as Array<[{ token: string }]>
    ).map(([input]) => input.token);

    expect(consumeAllForUser).toHaveBeenCalledTimes(2);
    expect(new Set(tokens).size).toBe(2);
  });

  it('propagates a delivery failure so the outbox retries the job', async () => {
    const { useCase } = buildDeps({
      sendPasswordReset: jest.fn().mockRejectedValue(new Error('smtp down')),
    });

    await expect(useCase.handle(JOB)).rejects.toThrow('smtp down');
  });
});
