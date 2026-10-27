import type { AppConfigService } from '@core/config';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import type {
  EmailJob,
  TokenHasher,
  TransactionManagerPort,
} from '@shared/application/ports';
import { OneTimeToken } from '@shared/application/tokens';
import { EmailConfirmationTokenEntity } from '../../../domain/entities/email-confirmation-token.entity';
import type { UserEntity } from '../../../domain/entities/user.entity';
import type { EmailConfirmationTokenRepository } from '../../../domain/repositories/email-confirmation-token.repository';
import type { UserRepository } from '../../../domain/repositories/user.repository';
import type { UserNotifier } from '../../ports/user-notifier.port';
import { IssueEmailConfirmationTokenService } from '../issue-email-confirmation-token.service';
import { buildUser } from '@test/support/builders/user.builder';
import { mockOf } from '@test/support/mocks/mock-of';

function buildConfig(): AppConfigService {
  return mockOf<AppConfigService>({
    verificationTokens: {
      emailConfirmationTtlHours: 48,
      passwordResetTtlMinutes: 60,
      userChangeRequestTtlHours: 48,
    },
  });
}

function buildJob(overrides: Partial<EmailJob> = {}): EmailJob {
  return {
    uuid: 'job-uuid',
    emailType: EmailType.EMAIL_CONFIRMATION,
    recipient: 'jane@example.com',
    locale: 'pt-BR',
    attempt: 1,
    ...overrides,
  };
}

function buildDeps(
  overrides: {
    hash?: jest.Mock;
    sendEmailConfirmation?: jest.Mock;
    current?: UserEntity | null;
  } = {},
) {
  const events: string[] = [];
  const consumeAllForUser = jest.fn().mockResolvedValue(undefined);

  const create = jest
    .fn()
    .mockImplementation((entity: EmailConfirmationTokenEntity) =>
      Promise.resolve(entity),
    );

  const tokenRepository = mockOf<EmailConfirmationTokenRepository>({
    create,
    findByUuid: jest.fn(),
    consumeAllForUser,
  });

  const hash = overrides.hash ?? jest.fn().mockReturnValue('hashed-secret');
  const tokenHasher = mockOf<TokenHasher>({ hash, verify: jest.fn() });

  const sendEmailConfirmation =
    overrides.sendEmailConfirmation ??
    jest.fn().mockImplementation(() => {
      events.push('notify');
      return Promise.resolve();
    });

  const userNotifier = mockOf<UserNotifier>({
    sendEmailConfirmation,
    sendPasswordReset: jest.fn(),
  });

  const runInTransaction = jest
    .fn()
    .mockImplementation(async (work: () => Promise<unknown>) => {
      events.push('begin');
      const result = await work();
      events.push('commit');
      return result;
    });

  const transactionManager = mockOf<TransactionManagerPort>({
    runInTransaction,
  });

  // Stands in for the row re-read under lock; by default the same unconfirmed
  // user the job was scheduled for.
  const findByIdForUpdate = jest.fn().mockImplementation(() => {
    events.push('lock');
    return Promise.resolve(
      overrides.current === undefined
        ? buildUser({ emailConfirmedAt: null })
        : overrides.current,
    );
  });

  const service = new IssueEmailConfirmationTokenService(
    tokenRepository,
    tokenHasher,
    userNotifier,
    transactionManager,
    buildConfig(),
    mockOf<UserRepository>({ findByIdForUpdate }),
  );

  return {
    service,
    consumeAllForUser,
    create,
    hash,
    sendEmailConfirmation,
    runInTransaction,
    findByIdForUpdate,
    events,
  };
}

describe('IssueEmailConfirmationTokenService', () => {
  it('consumes every prior outstanding token before issuing a new one', async () => {
    const { service, consumeAllForUser, create } = buildDeps();

    await service.issueFor(1, buildJob());

    expect(consumeAllForUser).toHaveBeenCalledWith(1);
    expect(consumeAllForUser.mock.invocationCallOrder[0]).toBeLessThan(
      create.mock.invocationCallOrder[0],
    );
  });

  it('supersedes and persists inside one transaction, and only then sends the email', async () => {
    const { service, runInTransaction, create, events } = buildDeps();

    await service.issueFor(1, buildJob());

    expect(runInTransaction).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['begin', 'lock', 'commit', 'notify']);
  });

  it('hashes only the secret half of the token, never the full "<uuid>.<secret>" string', async () => {
    const { service, hash, sendEmailConfirmation } = buildDeps();

    await service.issueFor(1, buildJob());

    const [hashedInput] = hash.mock.calls[0] as [string];
    expect(hashedInput).not.toContain('.');

    const [notifierInput] = sendEmailConfirmation.mock.calls[0] as [
      { token: string },
    ];

    expect(OneTimeToken.parse(notifierInput.token)?.secret).toBe(hashedInput);
  });

  it('sends the raw token in the job locale while the persisted row only ever holds the hash', async () => {
    const { service, create, sendEmailConfirmation } = buildDeps();

    await service.issueFor(1, buildJob({ locale: 'en' }));

    const [persistedEntity] = create.mock.calls[0] as [
      EmailConfirmationTokenEntity,
    ];

    const [notifierInput] = sendEmailConfirmation.mock.calls[0] as [
      { email: string; name: string; token: string; locale: string },
    ];

    expect(persistedEntity.tokenHash).toBe('hashed-secret');
    expect(persistedEntity.userId).toBe(1);
    expect(notifierInput).toMatchObject({
      email: 'jane@example.com',
      name: 'Jane Doe',
      locale: 'en',
    });

    const sentToken = OneTimeToken.parse(notifierInput.token);
    expect(sentToken?.uuid).toBe(persistedEntity.uuid);
    expect(sentToken?.secret).not.toBe(persistedEntity.tokenHash);
  });

  it('sets the token expiry from the configured email-confirmation TTL (hours)', async () => {
    const { service, create } = buildDeps();

    const before = Date.now();
    await service.issueFor(1, buildJob());

    const [persistedEntity] = create.mock.calls[0] as [
      EmailConfirmationTokenEntity,
    ];

    const expectedMs = 48 * 60 * 60 * 1000;
    const actualMs = persistedEntity.expiresAt.getTime() - before;

    expect(actualMs).toBeGreaterThan(expectedMs - 5_000);
    expect(actualMs).toBeLessThanOrEqual(expectedMs + 5_000);
  });

  it('propagates a delivery failure so the outbox can retry the job', async () => {
    const { service } = buildDeps({
      sendEmailConfirmation: jest.fn().mockRejectedValue(new Error('smtp')),
    });

    await expect(service.issueFor(1, buildJob())).rejects.toThrow('smtp');
  });

  describe('re-reads the user under the row lock', () => {
    it('issues for the locked row, using its current name', async () => {
      const {
        service,
        findByIdForUpdate,
        consumeAllForUser,
        sendEmailConfirmation,
      } = buildDeps({
        current: buildUser({
          id: 9,
          name: 'Jane Renamed',
          emailConfirmedAt: null,
        }),
      });

      await service.issueFor(9, buildJob());

      expect(findByIdForUpdate).toHaveBeenCalledWith(9);
      expect(findByIdForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
        consumeAllForUser.mock.invocationCallOrder[0],
      );
      expect(sendEmailConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'jane@example.com',
          name: 'Jane Renamed',
        }),
      );
    });

    it.each([
      {
        scenario: 'the email no longer matches the job recipient',
        current: buildUser({
          emailConfirmedAt: null,
          email: 'jane.new@example.com',
        }),
      },
      {
        scenario: 'the email was confirmed in the meantime',
        current: buildUser({ emailConfirmedAt: new Date() }),
      },
      {
        scenario: 'the user was deactivated',
        current: buildUser({
          emailConfirmedAt: null,
          status: RecordStatus.INACTIVE,
        }),
      },
      { scenario: 'the user is gone', current: null },
    ])('issues and sends nothing when $scenario', async ({ current }) => {
      const { service, consumeAllForUser, create, sendEmailConfirmation } =
        buildDeps({ current });

      await service.issueFor(1, buildJob());

      expect(consumeAllForUser).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(sendEmailConfirmation).not.toHaveBeenCalled();
    });
  });
});
