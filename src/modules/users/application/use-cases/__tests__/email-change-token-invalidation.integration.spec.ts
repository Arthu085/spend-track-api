import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { CoreHashingModule } from '@core/hashing';
import {
  EmailSchedulingUnavailableError,
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import { Sha256TokenHasher } from '@shared/infrastructure/hashing';
import { ROLE_REPOSITORY } from '@modules/authorization/domain/repositories/role.repository';
import { AbilityOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/ability.orm-entity';
import { RoleOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/role.orm-entity';
import { TypeOrmRoleRepository } from '@modules/authorization/infrastructure/persistence/repositories/typeorm-role.repository';
import { EmailOutboxModule } from '@modules/email-outbox/email-outbox.module';
import { DispatchEmailOutboxUseCase } from '@modules/email-outbox/application/use-cases/dispatch-email-outbox.use-case';
import {
  EMAIL_OUTBOX_REPOSITORY,
  type EmailOutboxRepository,
} from '@modules/email-outbox/domain/repositories/email-outbox.repository';
import { TypeOrmEmailOutboxRepository } from '@modules/email-outbox/infrastructure/persistence/repositories/typeorm-email-outbox.repository';
import { PasswordResetTokenEmailChangeRevoker } from '@modules/auth/application/services/password-reset-token-email-change-revoker';
import { DeliverPasswordResetEmailUseCase } from '@modules/auth/application/use-cases/deliver-password-reset-email.use-case';
import { RequestPasswordResetUseCase } from '@modules/auth/application/use-cases/request-password-reset.use-case';
import { ResetPasswordUseCase } from '@modules/auth/application/use-cases/reset-password.use-case';
import { InvalidPasswordResetTokenError } from '@modules/auth/domain/errors/invalid-password-reset-token.error';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from '@modules/auth/domain/repositories/password-reset-token.repository';
import { REFRESH_TOKEN_REPOSITORY } from '@modules/auth/domain/repositories/refresh-token.repository';
import { PasswordResetTokenOrmEntity } from '@modules/auth/infrastructure/persistence/entities/password-reset-token.orm-entity';
import { RefreshTokenOrmEntity } from '@modules/auth/infrastructure/persistence/entities/refresh-token.orm-entity';
import { TypeOrmPasswordResetTokenRepository } from '@modules/auth/infrastructure/persistence/repositories/typeorm-password-reset-token.repository';
import { TypeOrmRefreshTokenRepository } from '@modules/auth/infrastructure/persistence/repositories/typeorm-refresh-token.repository';
import { CurrentPasswordRequiredError } from '../../../domain/errors/current-password-required.error';
import { InvalidCurrentPasswordError } from '../../../domain/errors/invalid-current-password.error';
import { InvalidEmailConfirmationTokenError } from '../../../domain/errors/invalid-email-confirmation-token.error';
import { EMAIL_CONFIRMATION_TOKEN_REPOSITORY } from '../../../domain/repositories/email-confirmation-token.repository';
import { USER_REPOSITORY } from '../../../domain/repositories/user.repository';
import { EmailConfirmationTokenOrmEntity } from '../../../infrastructure/persistence/entities/email-confirmation-token.orm-entity';
import { UserChangeRequestOrmEntity } from '../../../infrastructure/persistence/entities/user-change-request.orm-entity';
import { UserOrmEntity } from '../../../infrastructure/persistence/entities/user.orm-entity';
import { TypeOrmEmailConfirmationTokenRepository } from '../../../infrastructure/persistence/repositories/typeorm-email-confirmation-token.repository';
import { TypeOrmUserChangeRequestRepository } from '../../../infrastructure/persistence/repositories/typeorm-user-change-request.repository';
import { USER_CHANGE_REQUEST_REPOSITORY } from '../../../domain/repositories/user-change-request.repository';
import { UserProfileChangeService } from '../../services/user-profile-change.service';
import { TypeOrmUserRepository } from '../../../infrastructure/persistence/repositories/typeorm-user.repository';
import { EMAIL_CHANGE_TOKEN_REVOKERS } from '../../ports/email-change-token-revoker.port';
import { USER_SESSION_REVOKERS } from '../../ports/user-session-revoker.port';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../ports/password-hasher.port';
import {
  USER_NOTIFIER,
  type UserNotifier,
} from '../../ports/user-notifier.port';
import { EmailChangeTokenRevokers } from '../../services/email-change-token-revokers';
import { IssueEmailConfirmationTokenService } from '../../services/issue-email-confirmation-token.service';
import { UserSessionRevokers } from '../../services/user-session-revokers';
import { ConfirmEmailUseCase } from '../confirm-email.use-case';
import { DeliverEmailChangeNoticeUseCase } from '../deliver-email-change-notice.use-case';
import { DeliverEmailConfirmationUseCase } from '../deliver-email-confirmation.use-case';
import { ResendEmailConfirmationUseCase } from '../resend-email-confirmation.use-case';
import { UpdateOwnProfileUseCase } from '../update-own-profile.use-case';
import { UpdateUserUseCase } from '../update-user.use-case';

interface SentEmail {
  kind: 'confirmation' | 'reset' | 'notice';
  email: string;
  token: string;
}

interface UserRow {
  email: string;
  email_confirmed_at: Date | null;
  password: string;
}

type TokenTable = 'email_confirmation_tokens' | 'password_reset_tokens';

// Runs the email change, the outbox, and every token flow against real
// Postgres, so a token that survives the change, a stale snapshot written back
// over the new address, or a revocation that escapes the rollback shows up in
// live rows. Emails are delivered by the real dispatcher and handlers. Races
// are ordered deterministically: one side is parked on a gate while the other
// runs or is observed blocking on the user row lock.
describe('Email change token invalidation (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let updateUser: UpdateUserUseCase;
  let updateOwnProfile: UpdateOwnProfileUseCase;
  let confirmEmail: ConfirmEmailUseCase;
  let resetPassword: ResetPasswordUseCase;
  let requestPasswordReset: RequestPasswordResetUseCase;
  let resendConfirmation: ResendEmailConfirmationUseCase;
  let dispatcher: DispatchEmailOutboxUseCase;
  let users: TypeOrmUserRepository;
  let confirmationTokens: TypeOrmEmailConfirmationTokenRepository;
  let resetTokens: TypeOrmPasswordResetTokenRepository;
  let transactionManager: TransactionManagerPort;

  const tokenHasher = new Sha256TokenHasher();
  const sent: SentEmail[] = [];

  const notifier: UserNotifier = {
    sendEmailChangeNotice: ({ email }) => {
      sent.push({ kind: 'notice', email, token: '' });
      return Promise.resolve();
    },
    sendEmailConfirmation: ({ email, token }) => {
      sent.push({ kind: 'confirmation', email, token });
      return Promise.resolve();
    },
    sendUserChangeRequest: () => Promise.resolve(),
    sendPasswordReset: ({ email, token }) => {
      sent.push({ kind: 'reset', email, token });
      return Promise.resolve();
    },
  };

  const passwordHasher: PasswordHasher = {
    hash: (value: string) => Promise.resolve(`hashed:${value}`),
    verify: (hash: string, value: string) =>
      Promise.resolve(hash === `hashed:${value}`),
  };

  beforeAll(async () => {
    process.env.EMAIL_OUTBOX_WORKER_ENABLED = 'false';

    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        CoreHashingModule,
        EmailOutboxModule,
        TypeOrmModule.forFeature([
          UserOrmEntity,
          RoleOrmEntity,
          AbilityOrmEntity,
          EmailConfirmationTokenOrmEntity,
          PasswordResetTokenOrmEntity,
          RefreshTokenOrmEntity,
          UserChangeRequestOrmEntity,
        ]),
      ],
      providers: [
        UpdateUserUseCase,
        UpdateOwnProfileUseCase,
        UserProfileChangeService,
        ConfirmEmailUseCase,
        ResetPasswordUseCase,
        RequestPasswordResetUseCase,
        ResendEmailConfirmationUseCase,
        DeliverEmailConfirmationUseCase,
        DeliverEmailChangeNoticeUseCase,
        DeliverPasswordResetEmailUseCase,
        IssueEmailConfirmationTokenService,
        PasswordResetTokenEmailChangeRevoker,
        TypeOrmUserRepository,
        TypeOrmEmailConfirmationTokenRepository,
        TypeOrmPasswordResetTokenRepository,
        { provide: USER_REPOSITORY, useExisting: TypeOrmUserRepository },
        { provide: ROLE_REPOSITORY, useClass: TypeOrmRoleRepository },
        {
          provide: USER_CHANGE_REQUEST_REPOSITORY,
          useClass: TypeOrmUserChangeRequestRepository,
        },
        {
          provide: EMAIL_CONFIRMATION_TOKEN_REPOSITORY,
          useExisting: TypeOrmEmailConfirmationTokenRepository,
        },
        {
          provide: PASSWORD_RESET_TOKEN_REPOSITORY,
          useExisting: TypeOrmPasswordResetTokenRepository,
        },
        {
          provide: REFRESH_TOKEN_REPOSITORY,
          useClass: TypeOrmRefreshTokenRepository,
        },
        {
          provide: EMAIL_CHANGE_TOKEN_REVOKERS,
          useClass: EmailChangeTokenRevokers,
        },
        { provide: USER_SESSION_REVOKERS, useClass: UserSessionRevokers },
        { provide: USER_NOTIFIER, useValue: notifier },
        { provide: PASSWORD_HASHER, useValue: passwordHasher },
      ],
    }).compile();

    // Runs `onModuleInit`, which registers the password-reset revoker and
    // both outbox delivery handlers.
    await moduleRef.init();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    updateUser = moduleRef.get(UpdateUserUseCase);
    updateOwnProfile = moduleRef.get(UpdateOwnProfileUseCase);
    confirmEmail = moduleRef.get(ConfirmEmailUseCase);
    resetPassword = moduleRef.get(ResetPasswordUseCase);
    requestPasswordReset = moduleRef.get(RequestPasswordResetUseCase);
    resendConfirmation = moduleRef.get(ResendEmailConfirmationUseCase);
    dispatcher = moduleRef.get(DispatchEmailOutboxUseCase);
    users = moduleRef.get(TypeOrmUserRepository);
    confirmationTokens = moduleRef.get(TypeOrmEmailConfirmationTokenRepository);
    resetTokens = moduleRef.get(TypeOrmPasswordResetTokenRepository);
    transactionManager = moduleRef.get(TRANSACTION_MANAGER);
  });

  afterAll(async () => {
    await moduleRef.close();
    delete process.env.EMAIL_OUTBOX_WORKER_ENABLED;
  });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    sent.length = 0;
    await dataSource.query(
      'TRUNCATE TABLE "email_confirmation_tokens", "password_reset_tokens", "refresh_tokens", "users", "email_outbox", "email_send_logs" RESTART IDENTITY CASCADE',
    );
  });

  async function insertUser(
    confirmed = false,
  ): Promise<{ id: number; uuid: string; email: string }> {
    const repo = dataSource.getRepository(UserOrmEntity);

    const saved = await repo.save(
      repo.create({
        name: 'Jane Doe',
        email: `${randomUUID()}@example.com`,
        password: 'hashed:OldPassword123!',
        emailConfirmedAt: confirmed ? new Date() : null,
        roles: [],
      }),
    );

    return { id: saved.id, uuid: saved.uuid, email: saved.email };
  }

  async function insertConfirmationToken(userId: number): Promise<string> {
    const repo = dataSource.getRepository(EmailConfirmationTokenOrmEntity);
    const secret = randomUUID();

    const saved = await repo.save(
      repo.create({
        userId,
        tokenHash: tokenHasher.hash(secret),
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
      }),
    );

    return `${saved.uuid}.${secret}`;
  }

  async function insertResetToken(userId: number): Promise<string> {
    const repo = dataSource.getRepository(PasswordResetTokenOrmEntity);
    const secret = randomUUID();

    const saved = await repo.save(
      repo.create({
        userId,
        tokenHash: tokenHasher.hash(secret),
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
      }),
    );

    return `${saved.uuid}.${secret}`;
  }

  function changeEmail(uuid: string, email: string) {
    return updateUser.execute({
      uuid,
      name: 'Jane Doe',
      email,
      roleUuids: [],
      actorId: null,
    });
  }

  async function findUserRow(id: number): Promise<UserRow> {
    const rows: UserRow[] = await dataSource.query(
      'SELECT email, email_confirmed_at, password FROM "users" WHERE id = $1',
      [id],
    );

    return rows[0];
  }

  async function countTokens(
    table: TokenTable,
    userId: number,
    onlyUnconsumed = true,
  ): Promise<number> {
    const rows: Array<{ count: number }> = await dataSource.query(
      `SELECT count(*)::int AS count FROM "${table}" WHERE user_id = $1${
        onlyUnconsumed ? ' AND consumed_at IS NULL' : ''
      }`,
      [userId],
    );

    return rows[0].count;
  }

  async function jobsFor(
    recipient: string,
  ): Promise<Array<{ status: string; attempts: number }>> {
    return dataSource.query(
      'SELECT status, attempts FROM "email_outbox" WHERE recipient = $1 ORDER BY id',
      [recipient],
    );
  }

  async function exhaustQuota(
    emailType: EmailType,
    recipient: string,
  ): Promise<void> {
    for (let slot = 0; slot < 5; slot++) {
      await dataSource.query(
        'INSERT INTO "email_send_logs" (email_type, recipient) VALUES ($1, $2)',
        [emailType, recipient],
      );
    }
  }

  // The dispatcher compares against a millisecond JS Date, while now() has
  // microsecond precision, so a job made due at now() can still look early.
  function skipBackoff(): Promise<unknown> {
    return dataSource.query(
      `UPDATE "email_outbox" SET available_at = now() - interval '1 second' WHERE status = 'PENDING'`,
    );
  }

  function sentTo(kind: SentEmail['kind'], email: string): SentEmail[] {
    return sent.filter((entry) => entry.kind === kind && entry.email === email);
  }

  function gate(): { opened: Promise<void>; open: () => void } {
    let open!: () => void;
    const opened = new Promise<void>((resolve) => (open = resolve));
    return { opened, open };
  }

  // Resolves once `mock` has been called, so a test can act while the code
  // under test is parked inside it.
  function reached(mock: jest.SpyInstance): Promise<void> {
    return new Promise((resolve) => {
      const poll = (): void => {
        if (mock.mock.calls.length > 0) resolve();
        else setTimeout(poll, 5);
      };

      poll();
    });
  }

  // Proves the other session is queued on a row lock rather than merely slow.
  async function waitUntilBlockedOnLock(): Promise<void> {
    const deadline = Date.now() + 5_000;

    for (;;) {
      const rows: Array<{ waiting: number }> = await dataSource.query(
        `SELECT count(*)::int AS waiting FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );

      if (rows[0].waiting > 0) return;
      if (Date.now() > deadline)
        throw new Error('No session blocked on a lock');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  // Parks the next token insert of `repository` after it ran inside the
  // issuing transaction, so the transaction holds the user row lock.
  function parkTokenInsert(
    repository: { create: (entity: never) => Promise<unknown> },
    afterInsert: () => Promise<void> = () => Promise.resolve(),
  ): { created: jest.SpyInstance; open: () => void } {
    const parked = gate();
    const create = repository.create.bind(repository);

    const created = jest
      .spyOn(repository, 'create')
      .mockImplementationOnce(async (entity) => {
        const saved = await create(entity);
        await parked.opened;
        await afterInsert();
        return saved;
      });

    return { created, open: parked.open };
  }

  // Stops the dispatcher after the parked job, so a job the change schedules
  // meanwhile waits for the next run instead of racing the assertions.
  function dispatchOneJob(created: jest.SpyInstance) {
    return dispatcher.execute({
      shouldStop: () => created.mock.calls.length > 0,
    });
  }

  // Runs the email change right after the handler's unlocked lookup, so the
  // change commits before the handler locks the user row.
  function changeEmailAfterNextLookup(uuid: string, newEmail: string): void {
    const findByEmail = users.findByEmail.bind(users);

    jest.spyOn(users, 'findByEmail').mockImplementationOnce(async (email) => {
      const found = await findByEmail(email);
      await changeEmail(uuid, newEmail);
      return found;
    });
  }

  describe('a committed email change', () => {
    it('consumes every outstanding confirmation and reset token, and only the new address can be confirmed', async () => {
      const user = await insertUser(true);
      const oldConfirmation = await insertConfirmationToken(user.id);
      const oldReset = await insertResetToken(user.id);
      const newEmail = `${randomUUID()}@example.com`;

      await changeEmail(user.uuid, newEmail);

      await expect(countTokens('password_reset_tokens', user.id)).resolves.toBe(
        0,
      );
      await expect(
        countTokens('email_confirmation_tokens', user.id),
      ).resolves.toBe(0);
      await expect(jobsFor(newEmail)).resolves.toHaveLength(1);

      await expect(
        confirmEmail.execute({ token: oldConfirmation }),
      ).rejects.toBeInstanceOf(InvalidEmailConfirmationTokenError);
      await expect(
        resetPassword.execute({ token: oldReset, password: 'NewPassword123!' }),
      ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);

      await expect(findUserRow(user.id)).resolves.toEqual({
        email: newEmail,
        email_confirmed_at: null,
        password: 'hashed:OldPassword123!',
      });

      await dispatcher.execute();

      const [issued] = sentTo('confirmation', newEmail);
      await confirmEmail.execute({ token: issued.token });

      const row = await findUserRow(user.id);
      expect(row.email).toBe(newEmail);
      expect(row.email_confirmed_at).not.toBeNull();
    });

    it('still consumes outstanding tokens when the send quota is exhausted, leaving no usable link until a resend', async () => {
      const user = await insertUser(true);
      const oldConfirmation = await insertConfirmationToken(user.id);
      const oldReset = await insertResetToken(user.id);
      const newEmail = `${randomUUID()}@example.com`;
      await exhaustQuota(EmailType.EMAIL_CONFIRMATION, newEmail);

      await expect(changeEmail(user.uuid, newEmail)).resolves.toMatchObject({
        email: newEmail,
      });
      await dispatcher.execute();

      expect(sent).toEqual([]);
      await expect(jobsFor(newEmail)).resolves.toEqual([]);
      await expect(
        countTokens('email_confirmation_tokens', user.id),
      ).resolves.toBe(0);
      await expect(countTokens('password_reset_tokens', user.id)).resolves.toBe(
        0,
      );
      await expect(
        confirmEmail.execute({ token: oldConfirmation }),
      ).rejects.toBeInstanceOf(InvalidEmailConfirmationTokenError);
      await expect(
        resetPassword.execute({ token: oldReset, password: 'NewPassword123!' }),
      ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);

      // The next day the quota allows it again and a resend recovers.
      await dataSource.query(
        `UPDATE "email_send_logs" SET created_at = created_at - interval '1 day'`,
      );
      await resendConfirmation.execute({ email: newEmail });
      await dispatcher.execute();

      const [issued] = sentTo('confirmation', newEmail);
      await confirmEmail.execute({ token: issued.token });
      expect((await findUserRow(user.id)).email_confirmed_at).not.toBeNull();
    });

    it('applies a self-service email change through the same path, so only the new address can be confirmed', async () => {
      const user = await insertUser(true);
      const oldConfirmation = await insertConfirmationToken(user.id);
      const oldReset = await insertResetToken(user.id);
      const newEmail = `${randomUUID()}@example.com`;

      await updateOwnProfile.execute({
        actorId: user.id,
        email: newEmail,
        currentPassword: 'OldPassword123!',
      });

      await expect(countTokens('password_reset_tokens', user.id)).resolves.toBe(
        0,
      );
      await expect(
        countTokens('email_confirmation_tokens', user.id),
      ).resolves.toBe(0);
      await expect(findUserRow(user.id)).resolves.toEqual({
        email: newEmail,
        email_confirmed_at: null,
        password: 'hashed:OldPassword123!',
      });
      await expect(
        confirmEmail.execute({ token: oldConfirmation }),
      ).rejects.toBeInstanceOf(InvalidEmailConfirmationTokenError);
      await expect(
        resetPassword.execute({ token: oldReset, password: 'NewPassword123!' }),
      ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);

      await expect(jobsFor(user.email)).resolves.toHaveLength(1);

      await dispatcher.execute();

      expect(sentTo('notice', user.email)).toHaveLength(1);
      expect(sentTo('notice', newEmail)).toEqual([]);

      const [issued] = sentTo('confirmation', newEmail);
      await confirmEmail.execute({ token: issued.token });
      expect((await findUserRow(user.id)).email_confirmed_at).not.toBeNull();
    });

    it.each([
      {
        scenario: 'without the current password',
        currentPassword: undefined,
        expected: CurrentPasswordRequiredError,
      },
      {
        scenario: 'with a wrong current password',
        currentPassword: 'WrongPassword123!',
        expected: InvalidCurrentPasswordError,
      },
    ])(
      'refuses a self-service email change $scenario, leaving the email, tokens, and outbox untouched',
      async ({ currentPassword, expected }) => {
        const user = await insertUser(true);
        await insertConfirmationToken(user.id);
        await insertResetToken(user.id);
        const newEmail = `${randomUUID()}@example.com`;

        await expect(
          updateOwnProfile.execute({
            actorId: user.id,
            email: newEmail,
            currentPassword,
          }),
        ).rejects.toBeInstanceOf(expected);

        expect((await findUserRow(user.id)).email).toBe(user.email);
        await expect(
          countTokens('email_confirmation_tokens', user.id),
        ).resolves.toBe(1);
        await expect(
          countTokens('password_reset_tokens', user.id),
        ).resolves.toBe(1);
        await expect(jobsFor(user.email)).resolves.toEqual([]);
        await expect(jobsFor(newEmail)).resolves.toEqual([]);
      },
    );

    it('rolls a self-service email change back when the notice to the old address cannot be enqueued', async () => {
      const user = await insertUser(true);
      await insertConfirmationToken(user.id);
      const newEmail = `${randomUUID()}@example.com`;

      // The confirmation for the new address is enqueued; only the notice
      // for the old one fails.
      const outbox = moduleRef.get<EmailOutboxRepository>(
        EMAIL_OUTBOX_REPOSITORY,
        { strict: false },
      );

      const enqueue = outbox.enqueue.bind(outbox);

      jest
        .spyOn(outbox, 'enqueue')
        .mockImplementation((input) =>
          input.emailType === EmailType.EMAIL_CHANGE_NOTICE
            ? Promise.reject(new Error('insert failed'))
            : enqueue(input),
        );

      await expect(
        updateOwnProfile.execute({
          actorId: user.id,
          email: newEmail,
          currentPassword: 'OldPassword123!',
        }),
      ).rejects.toBeInstanceOf(EmailSchedulingUnavailableError);

      expect((await findUserRow(user.id)).email).toBe(user.email);
      await expect(
        countTokens('email_confirmation_tokens', user.id),
      ).resolves.toBe(1);
      await expect(jobsFor(newEmail)).resolves.toEqual([]);
      await expect(jobsFor(user.email)).resolves.toEqual([]);
    });

    it('revokes nothing when the email is unchanged', async () => {
      const user = await insertUser(true);
      await insertConfirmationToken(user.id);
      await insertResetToken(user.id);

      await changeEmail(user.uuid, user.email);

      await expect(
        countTokens('email_confirmation_tokens', user.id),
      ).resolves.toBe(1);
      await expect(countTokens('password_reset_tokens', user.id)).resolves.toBe(
        1,
      );
    });
  });

  describe('rollback', () => {
    it.each([
      {
        failure: 'the password-reset revoker fails',
        expected: 'boom',
        arrange: () =>
          jest
            .spyOn(resetTokens, 'consumeAllForUser')
            .mockRejectedValueOnce(new Error('boom')),
      },
      {
        failure: 'the user update fails',
        expected: 'boom',
        arrange: () =>
          jest.spyOn(users, 'update').mockRejectedValueOnce(new Error('boom')),
      },
      {
        failure: 'the confirmation job cannot be enqueued',
        expected: EmailSchedulingUnavailableError,
        arrange: () =>
          jest
            .spyOn(TypeOrmEmailOutboxRepository.prototype, 'enqueue')
            .mockRejectedValueOnce(new Error('insert failed')),
      },
    ])(
      'leaves the email, every token, the outbox, and the quota untouched when $failure',
      async ({ arrange, expected }) => {
        const user = await insertUser(true);
        const confirmation = await insertConfirmationToken(user.id);
        const reset = await insertResetToken(user.id);
        arrange();

        await expect(
          changeEmail(user.uuid, `${randomUUID()}@example.com`),
        ).rejects.toThrow(expected);

        expect((await findUserRow(user.id)).email).toBe(user.email);
        await expect(
          countTokens('email_confirmation_tokens', user.id),
        ).resolves.toBe(1);
        await expect(
          countTokens('password_reset_tokens', user.id),
        ).resolves.toBe(1);

        const [{ jobs, slots }]: Array<{ jobs: number; slots: number }> =
          await dataSource.query(
            'SELECT (SELECT count(*)::int FROM "email_outbox") AS jobs, (SELECT count(*)::int FROM "email_send_logs") AS slots',
          );

        expect({ jobs, slots }).toEqual({ jobs: 0, slots: 0 });
        await dispatcher.execute();
        expect(sent).toEqual([]);

        // Both links still work for the unchanged address.
        await confirmEmail.execute({ token: confirmation });
        await resetPassword.execute({
          token: reset,
          password: 'NewPassword123!',
        });
      },
    );
  });

  describe('races between token flows and an email change', () => {
    it('rejects a confirmation that passed its checks before the change committed, without restoring the old address', async () => {
      const user = await insertUser(false);
      const oldConfirmation = await insertConfirmationToken(user.id);
      const newEmail = `${randomUUID()}@example.com`;
      const parked = gate();
      const findByUuid = confirmationTokens.findByUuid.bind(confirmationTokens);

      const lookup = jest
        .spyOn(confirmationTokens, 'findByUuid')
        .mockImplementationOnce(async (uuid) => {
          const token = await findByUuid(uuid);
          await parked.opened;
          return token;
        });

      const confirming = confirmEmail.execute({ token: oldConfirmation });
      await reached(lookup);

      await changeEmail(user.uuid, newEmail);
      parked.open();

      await expect(confirming).rejects.toBeInstanceOf(
        InvalidEmailConfirmationTokenError,
      );
      await expect(findUserRow(user.id)).resolves.toMatchObject({
        email: newEmail,
        email_confirmed_at: null,
      });
    });

    it('lets a confirmation that locked the user first finish, then the change un-confirms the new address', async () => {
      const user = await insertUser(false);
      const oldConfirmation = await insertConfirmationToken(user.id);
      const newEmail = `${randomUUID()}@example.com`;
      const parked = gate();

      const claim =
        confirmationTokens.consumeIfUnconsumed.bind(confirmationTokens);

      const claimed = jest
        .spyOn(confirmationTokens, 'consumeIfUnconsumed')
        .mockImplementationOnce(async (uuid) => {
          const result = await claim(uuid);
          await parked.opened;
          return result;
        });

      const confirming = confirmEmail.execute({ token: oldConfirmation });
      await reached(claimed);

      const changing = changeEmail(user.uuid, newEmail);
      await waitUntilBlockedOnLock();
      parked.open();

      await expect(confirming).resolves.toBeUndefined();
      await expect(changing).resolves.toMatchObject({ email: newEmail });
      await expect(findUserRow(user.id)).resolves.toMatchObject({
        email: newEmail,
        email_confirmed_at: null,
      });

      await dispatcher.execute();
      expect(sentTo('confirmation', newEmail)).toHaveLength(1);
    });

    it('rejects a password reset that passed its checks before the change committed, without restoring the old address or confirming the new one', async () => {
      const user = await insertUser(true);
      const oldReset = await insertResetToken(user.id);
      const newEmail = `${randomUUID()}@example.com`;
      const parked = gate();

      const hashing = jest
        .spyOn(passwordHasher, 'hash')
        .mockImplementationOnce(async (value) => {
          await parked.opened;
          return `hashed:${value}`;
        });

      const resetting = resetPassword.execute({
        token: oldReset,
        password: 'NewPassword123!',
      });

      await reached(hashing);

      await changeEmail(user.uuid, newEmail);
      parked.open();

      await expect(resetting).rejects.toBeInstanceOf(
        InvalidPasswordResetTokenError,
      );
      await expect(findUserRow(user.id)).resolves.toEqual({
        email: newEmail,
        email_confirmed_at: null,
        password: 'hashed:OldPassword123!',
      });
    });

    // A FOR UPDATE lock would block the FK check of this insert and could
    // deadlock a password reset against a concurrent refresh-token rotation.
    it('lets another session insert a token for the user while the user row lock is held', async () => {
      const user = await insertUser(true);
      const locked = gate();
      const release = gate();

      const holding = transactionManager.runInTransaction(async () => {
        await users.findByIdForUpdate(user.id);
        locked.open();
        await release.opened;
      });

      await locked.opened;

      const insertedWhileLocked = await Promise.race([
        insertResetToken(user.id).then(() => true),
        new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), 2_000),
        ),
      ]);

      release.open();
      await holding;

      expect(insertedWhileLocked).toBe(true);
    });
  });

  // Every outbox scenario asserts the same invariant: no token issued for a
  // job remains usable once the user's email has moved away from the job's
  // recipient, whatever order the delivery and the change commit in.
  describe('outbox delivery and an email change', () => {
    describe.each([
      {
        kind: 'reset' as const,
        emailType: EmailType.PASSWORD_RESET,
        table: 'password_reset_tokens' as const,
        confirmed: true,
        schedule: (email: string) => requestPasswordReset.execute({ email }),
        tokens: () => resetTokens,
        redeem: (token: string) =>
          resetPassword.execute({ token, password: 'NewPassword123!' }),
        invalidToken: InvalidPasswordResetTokenError,
      },
      {
        kind: 'confirmation' as const,
        emailType: EmailType.EMAIL_CONFIRMATION,
        table: 'email_confirmation_tokens' as const,
        confirmed: false,
        schedule: (email: string) => resendConfirmation.execute({ email }),
        tokens: () => confirmationTokens,
        redeem: (token: string) => confirmEmail.execute({ token }),
        invalidToken: InvalidEmailConfirmationTokenError,
      },
    ])(
      '$emailType',
      ({ kind, table, confirmed, schedule, tokens, redeem, invalidToken }) => {
        it('issues and sends nothing when the change committed before the job ran', async () => {
          const user = await insertUser(confirmed);
          const newEmail = `${randomUUID()}@example.com`;
          await schedule(user.email);

          await changeEmail(user.uuid, newEmail);
          await dispatcher.execute();

          expect(sentTo(kind, user.email)).toEqual([]);
          await expect(jobsFor(user.email)).resolves.toEqual([
            { status: 'SENT', attempts: 1 },
          ]);
          await expect(countTokens(table, user.id, false)).resolves.toBe(
            kind === 'confirmation' ? 1 : 0,
          );
        });

        it('issues nothing when the change commits between the handler lookup and its row lock', async () => {
          const user = await insertUser(confirmed);
          const newEmail = `${randomUUID()}@example.com`;
          await schedule(user.email);
          changeEmailAfterNextLookup(user.uuid, newEmail);

          await dispatcher.execute();

          expect(sentTo(kind, user.email)).toEqual([]);
          await expect(countTokens(table, user.id)).resolves.toBe(
            kind === 'confirmation' ? 1 : 0,
          );
          expect(sentTo(kind, newEmail)).toHaveLength(
            kind === 'confirmation' ? 1 : 0,
          );
        });

        it('revokes the token the handler committed while the change waited on the user row lock', async () => {
          const user = await insertUser(confirmed);
          const newEmail = `${randomUUID()}@example.com`;
          await schedule(user.email);
          const parked = parkTokenInsert(tokens());

          const dispatching = dispatchOneJob(parked.created);
          await reached(parked.created);

          const changing = changeEmail(user.uuid, newEmail);
          await waitUntilBlockedOnLock();
          parked.open();
          await Promise.all([dispatching, changing]);

          const [staleLink] = sentTo(kind, user.email);
          expect(staleLink).toBeDefined();
          await expect(redeem(staleLink.token)).rejects.toBeInstanceOf(
            invalidToken,
          );
          await expect(findUserRow(user.id)).resolves.toMatchObject({
            email: newEmail,
          });
        });

        it('releases the lock to a waiting change when the issuing transaction rolls back, and the retry sends nothing to the old address', async () => {
          const user = await insertUser(confirmed);
          const newEmail = `${randomUUID()}@example.com`;
          await schedule(user.email);

          const parked = parkTokenInsert(tokens(), () =>
            Promise.reject(new Error('issue failed')),
          );

          const dispatching = dispatchOneJob(parked.created);
          await reached(parked.created);

          const changing = changeEmail(user.uuid, newEmail);
          await waitUntilBlockedOnLock();
          parked.open();

          await expect(dispatching).resolves.toMatchObject({ retried: 1 });
          await expect(changing).resolves.toMatchObject({ email: newEmail });
          await expect(countTokens(table, user.id, false)).resolves.toBe(0);

          await skipBackoff();
          await dispatcher.execute();

          expect(sentTo(kind, user.email)).toEqual([]);
          await expect(countTokens(table, user.id)).resolves.toBe(
            kind === 'confirmation' ? 1 : 0,
          );
        });

        it('sends nothing on a retry that runs after the change, and the first attempt token is dead', async () => {
          const user = await insertUser(confirmed);
          const newEmail = `${randomUUID()}@example.com`;
          await schedule(user.email);

          jest
            .spyOn(
              notifier,
              kind === 'reset' ? 'sendPasswordReset' : 'sendEmailConfirmation',
            )
            .mockRejectedValueOnce(new Error('421 try again'));

          await expect(dispatcher.execute()).resolves.toMatchObject({
            retried: 1,
          });
          await expect(countTokens(table, user.id)).resolves.toBe(1);

          await changeEmail(user.uuid, newEmail);
          await expect(countTokens(table, user.id)).resolves.toBe(0);

          await skipBackoff();
          await dispatcher.execute();

          expect(sentTo(kind, user.email)).toEqual([]);
          await expect(jobsFor(user.email)).resolves.toEqual([
            { status: 'SENT', attempts: 2 },
          ]);
          await expect(countTokens(table, user.id)).resolves.toBe(
            kind === 'confirmation' ? 1 : 0,
          );
        });

        it('sends nothing when a job abandoned by a crashed worker is reclaimed after the change', async () => {
          const user = await insertUser(confirmed);
          const newEmail = `${randomUUID()}@example.com`;
          await schedule(user.email);

          await dataSource.query(
            `UPDATE "email_outbox"
             SET status = 'PROCESSING', attempts = 1, locked_until = now() - interval '1 minute'
             WHERE recipient = $1`,
            [user.email],
          );

          await changeEmail(user.uuid, newEmail);
          await dispatcher.execute();

          expect(sentTo(kind, user.email)).toEqual([]);
          await expect(jobsFor(user.email)).resolves.toEqual([
            { status: 'SENT', attempts: 2 },
          ]);
        });
      },
    );
  });
});
