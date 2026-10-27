import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { CoreHashingModule } from '@core/hashing';
import { AbilityOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/ability.orm-entity';
import { RoleOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/role.orm-entity';
import { TypeOrmRoleRepository } from '@modules/authorization/infrastructure/persistence/repositories/typeorm-role.repository';
import { ROLE_REPOSITORY } from '@modules/authorization';
import { EmailOutboxModule } from '@modules/email-outbox/email-outbox.module';
import { DispatchEmailOutboxUseCase } from '@modules/email-outbox/application/use-cases/dispatch-email-outbox.use-case';
import { TypeOrmEmailOutboxRepository } from '@modules/email-outbox/infrastructure/persistence/repositories/typeorm-email-outbox.repository';
import { TypeOrmEmailSendLogRepository } from '@modules/email-quota/infrastructure/persistence/repositories/typeorm-email-send-log.repository';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import { EmailSchedulingUnavailableError } from '@shared/application/ports';
import { OneTimeToken } from '@shared/application/tokens';
import { EMAIL_CONFIRMATION_TOKEN_REPOSITORY } from '../../../domain/repositories/email-confirmation-token.repository';
import { USER_REPOSITORY } from '../../../domain/repositories/user.repository';
import { EmailConfirmationTokenOrmEntity } from '../../../infrastructure/persistence/entities/email-confirmation-token.orm-entity';
import { UserOrmEntity } from '../../../infrastructure/persistence/entities/user.orm-entity';
import { TypeOrmEmailConfirmationTokenRepository } from '../../../infrastructure/persistence/repositories/typeorm-email-confirmation-token.repository';
import { TypeOrmUserRepository } from '../../../infrastructure/persistence/repositories/typeorm-user.repository';
import { PASSWORD_HASHER } from '../../ports/password-hasher.port';
import { USER_NOTIFIER } from '../../ports/user-notifier.port';
import { IssueEmailConfirmationTokenService } from '../../services/issue-email-confirmation-token.service';
import { ConfirmEmailUseCase } from '../confirm-email.use-case';
import { CreateUserUseCase } from '../create-user.use-case';
import { DeliverEmailConfirmationUseCase } from '../deliver-email-confirmation.use-case';
import { ResendEmailConfirmationUseCase } from '../resend-email-confirmation.use-case';

// Runs against real Postgres so a user row committed without its
// confirmation job (or a job or quota slot without its user) shows up in the
// live tables.
describe('CreateUserUseCase (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let useCase: CreateUserUseCase;
  let dispatcher: DispatchEmailOutboxUseCase;
  let userRepository: TypeOrmUserRepository;
  let resendConfirmation: ResendEmailConfirmationUseCase;
  let confirmEmail: ConfirmEmailUseCase;

  const sendEmailConfirmation = jest.fn();

  const input = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    password: 'plain-password',
    roleUuids: [],
    actorId: null,
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
        ]),
      ],
      providers: [
        CreateUserUseCase,
        ResendEmailConfirmationUseCase,
        ConfirmEmailUseCase,
        DeliverEmailConfirmationUseCase,
        IssueEmailConfirmationTokenService,
        TypeOrmUserRepository,
        { provide: USER_REPOSITORY, useExisting: TypeOrmUserRepository },
        { provide: ROLE_REPOSITORY, useClass: TypeOrmRoleRepository },
        {
          provide: EMAIL_CONFIRMATION_TOKEN_REPOSITORY,
          useClass: TypeOrmEmailConfirmationTokenRepository,
        },
        {
          provide: PASSWORD_HASHER,
          useValue: {
            hash: () => Promise.resolve('hashed-password'),
            verify: () => Promise.resolve(true),
          },
        },
        {
          provide: USER_NOTIFIER,
          useValue: { sendEmailConfirmation, sendPasswordReset: jest.fn() },
        },
      ],
    }).compile();

    await moduleRef.init();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    useCase = moduleRef.get(CreateUserUseCase);
    dispatcher = moduleRef.get(DispatchEmailOutboxUseCase);
    userRepository = moduleRef.get(TypeOrmUserRepository);
    resendConfirmation = moduleRef.get(ResendEmailConfirmationUseCase);
    confirmEmail = moduleRef.get(ConfirmEmailUseCase);
  });

  afterAll(async () => {
    await moduleRef.close();
    delete process.env.EMAIL_OUTBOX_WORKER_ENABLED;
  });

  beforeEach(() => {
    sendEmailConfirmation.mockResolvedValue(undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    await dataSource.query(
      'TRUNCATE TABLE "email_confirmation_tokens", "users", "email_outbox", "email_send_logs" RESTART IDENTITY CASCADE',
    );
  });

  async function countRows(
    table:
      | 'users'
      | 'email_confirmation_tokens'
      | 'email_outbox'
      | 'email_send_logs',
  ): Promise<number> {
    const rows: Array<{ count: string }> = await dataSource.query(
      `SELECT COUNT(*) AS count FROM "${table}"`,
    );

    return Number(rows[0].count);
  }

  it('commits the user together with one confirmation job and its quota slot, and sends nothing yet', async () => {
    await useCase.execute(input);

    await expect(countRows('users')).resolves.toBe(1);
    await expect(countRows('email_outbox')).resolves.toBe(1);
    await expect(countRows('email_send_logs')).resolves.toBe(1);
    await expect(countRows('email_confirmation_tokens')).resolves.toBe(0);
    expect(sendEmailConfirmation).not.toHaveBeenCalled();
  });

  it('mints the token and sends it when the worker delivers the job', async () => {
    const created = await useCase.execute(input);

    await expect(dispatcher.execute()).resolves.toMatchObject({ sent: 1 });

    const tokenRows: Array<{ uuid: string; user_id: number }> =
      await dataSource.query(
        'SELECT uuid, user_id FROM "email_confirmation_tokens"',
      );

    expect(tokenRows).toHaveLength(1);
    expect(tokenRows[0].user_id).toBe(created.id);

    const [notifierInput] = sendEmailConfirmation.mock.calls[0] as [
      { token: string; email: string },
    ];

    expect(notifierInput.email).toBe('jane@example.com');
    expect(OneTimeToken.parse(notifierInput.token)?.uuid).toBe(
      tokenRows[0].uuid,
    );
  });

  it('enqueues nothing and consumes no quota when the user insert fails', async () => {
    jest
      .spyOn(userRepository, 'create')
      .mockRejectedValueOnce(new Error('boom'));

    await expect(useCase.execute(input)).rejects.toThrow('boom');

    await expect(countRows('users')).resolves.toBe(0);
    await expect(countRows('email_outbox')).resolves.toBe(0);
    await expect(countRows('email_send_logs')).resolves.toBe(0);
  });

  it('rolls the user back with no job and no slot when enqueueing the job fails', async () => {
    jest
      .spyOn(TypeOrmEmailOutboxRepository.prototype, 'enqueue')
      .mockRejectedValueOnce(new Error('insert failed'));

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      EmailSchedulingUnavailableError,
    );

    await expect(countRows('users')).resolves.toBe(0);
    await expect(countRows('email_outbox')).resolves.toBe(0);
    await expect(countRows('email_send_logs')).resolves.toBe(0);
  });

  it('rolls the user back with no job and no slot when the quota check reports UNAVAILABLE', async () => {
    jest
      .spyOn(TypeOrmEmailSendLogRepository.prototype, 'consumeDailySlot')
      .mockRejectedValueOnce(new Error('lock timeout'));

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(
      EmailSchedulingUnavailableError,
    );

    await expect(countRows('users')).resolves.toBe(0);
    await expect(countRows('email_outbox')).resolves.toBe(0);
    await expect(countRows('email_send_logs')).resolves.toBe(0);
  });

  it('keeps the committed user but enqueues nothing when the quota is exhausted', async () => {
    await exhaustConfirmationQuota();

    await useCase.execute(input);

    await expect(countRows('users')).resolves.toBe(1);
    await expect(countRows('email_outbox')).resolves.toBe(0);
    await expect(countRows('email_send_logs')).resolves.toBe(5);
  });

  it('lets a user created under an exhausted quota confirm through resend-confirmation once the quota allows it', async () => {
    await exhaustConfirmationQuota();
    const created = await useCase.execute(input);

    await dataSource.query(
      `UPDATE "email_send_logs" SET created_at = created_at - interval '1 day'`,
    );

    await resendConfirmation.execute({ email: 'Jane@Example.com' });
    await expect(dispatcher.execute()).resolves.toMatchObject({ sent: 1 });

    const [notifierInput] = sendEmailConfirmation.mock.calls[0] as [
      { token: string; email: string },
    ];

    expect(notifierInput.email).toBe('jane@example.com');

    await confirmEmail.execute({ token: notifierInput.token });

    const confirmed = await userRepository.findById(created.id);
    expect(confirmed?.emailConfirmedAt).not.toBeNull();
  });

  async function exhaustConfirmationQuota(): Promise<void> {
    for (let slot = 0; slot < 5; slot++) {
      await dataSource.query(
        'INSERT INTO "email_send_logs" (email_type, recipient) VALUES ($1, $2)',
        [EmailType.EMAIL_CONFIRMATION, input.email],
      );
    }
  }
});
