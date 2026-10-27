import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { CoreHashingModule } from '@core/hashing';
import { Sha256TokenHasher } from '@shared/infrastructure/hashing';
import { AbilityOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/ability.orm-entity';
import { RoleOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/role.orm-entity';
import { InvalidEmailConfirmationTokenError } from '../../../domain/errors/invalid-email-confirmation-token.error';
import { EMAIL_CONFIRMATION_TOKEN_REPOSITORY } from '../../../domain/repositories/email-confirmation-token.repository';
import { USER_REPOSITORY } from '../../../domain/repositories/user.repository';
import { EmailConfirmationTokenOrmEntity } from '../../../infrastructure/persistence/entities/email-confirmation-token.orm-entity';
import { UserOrmEntity } from '../../../infrastructure/persistence/entities/user.orm-entity';
import { TypeOrmEmailConfirmationTokenRepository } from '../../../infrastructure/persistence/repositories/typeorm-email-confirmation-token.repository';
import { TypeOrmUserRepository } from '../../../infrastructure/persistence/repositories/typeorm-user.repository';
import { ConfirmEmailUseCase } from '../confirm-email.use-case';

// Runs against real Postgres so a lost race between concurrent confirmations
// of the same token, or a failed rollback of the token consumption, shows up in
// the live rows.
describe('ConfirmEmailUseCase (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let useCase: ConfirmEmailUseCase;
  let tokenRepository: TypeOrmEmailConfirmationTokenRepository;
  let userRepository: TypeOrmUserRepository;

  const tokenHasher = new Sha256TokenHasher();

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        CoreHashingModule,
        TypeOrmModule.forFeature([
          UserOrmEntity,
          RoleOrmEntity,
          AbilityOrmEntity,
          EmailConfirmationTokenOrmEntity,
        ]),
      ],
      providers: [
        ConfirmEmailUseCase,
        TypeOrmUserRepository,
        TypeOrmEmailConfirmationTokenRepository,
        { provide: USER_REPOSITORY, useExisting: TypeOrmUserRepository },
        {
          provide: EMAIL_CONFIRMATION_TOKEN_REPOSITORY,
          useExisting: TypeOrmEmailConfirmationTokenRepository,
        },
      ],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    useCase = moduleRef.get(ConfirmEmailUseCase);
    tokenRepository = moduleRef.get(TypeOrmEmailConfirmationTokenRepository);
    userRepository = moduleRef.get(TypeOrmUserRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await dataSource.query(
      'TRUNCATE TABLE "email_confirmation_tokens", "users" RESTART IDENTITY CASCADE',
    );
  });

  async function insertUnconfirmedUser(): Promise<UserOrmEntity> {
    const userRepo = dataSource.getRepository(UserOrmEntity);

    return userRepo.save(
      userRepo.create({
        name: 'Jane Doe',
        email: `${randomUUID()}@example.com`,
        password: 'hashed:irrelevant',
        emailConfirmedAt: null,
        roles: [],
      }),
    );
  }

  async function insertUsableToken(
    userId: number,
  ): Promise<EmailConfirmationTokenOrmEntity> {
    const tokenRepo = dataSource.getRepository(EmailConfirmationTokenOrmEntity);

    return tokenRepo.save(
      tokenRepo.create({
        userId,
        tokenHash: tokenHasher.hash('secret'),
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
      }),
    );
  }

  async function findEmailConfirmedAt(userId: number): Promise<Date | null> {
    const rows: Array<{ email_confirmed_at: Date | null }> =
      await dataSource.query(
        'SELECT email_confirmed_at FROM "users" WHERE id = $1',
        [userId],
      );

    return rows[0].email_confirmed_at;
  }

  async function findTokenConsumedAt(uuid: string): Promise<Date | null> {
    const rows: Array<{ consumed_at: Date | null }> = await dataSource.query(
      'SELECT consumed_at FROM "email_confirmation_tokens" WHERE uuid = $1',
      [uuid],
    );

    return rows[0].consumed_at;
  }

  // Holds every token lookup until both concurrent requests have read the
  // still-unconsumed token, so both pass the pre-check and race on the write.
  function holdLookupsUntilBothRead(): void {
    const findByUuid = tokenRepository.findByUuid.bind(tokenRepository);
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => (release = resolve));
    let reads = 0;

    jest
      .spyOn(tokenRepository, 'findByUuid')
      .mockImplementation(async (uuid) => {
        const token = await findByUuid(uuid);
        reads += 1;
        if (reads === 2) release();
        await bothRead;
        return token;
      });
  }

  it('confirms the email and consumes the token on the happy path', async () => {
    const user = await insertUnconfirmedUser();
    const token = await insertUsableToken(user.id);

    await useCase.execute({ token: `${token.uuid}.secret` });

    await expect(findEmailConfirmedAt(user.id)).resolves.not.toBeNull();
    await expect(findTokenConsumedAt(token.uuid)).resolves.not.toBeNull();
  });

  it('rejects a wrong secret for an existing token without confirming the email or consuming the token', async () => {
    const user = await insertUnconfirmedUser();
    const token = await insertUsableToken(user.id);

    await expect(
      useCase.execute({ token: `${token.uuid}.wrong-secret` }),
    ).rejects.toBeInstanceOf(InvalidEmailConfirmationTokenError);

    await expect(findEmailConfirmedAt(user.id)).resolves.toBeNull();
    await expect(findTokenConsumedAt(token.uuid)).resolves.toBeNull();
  });

  it('rolls back the token consumption when confirming the user fails, leaving the token usable', async () => {
    const user = await insertUnconfirmedUser();
    const token = await insertUsableToken(user.id);

    jest
      .spyOn(userRepository, 'update')
      .mockRejectedValueOnce(new Error('boom'));

    await expect(
      useCase.execute({ token: `${token.uuid}.secret` }),
    ).rejects.toThrow('boom');

    await expect(findEmailConfirmedAt(user.id)).resolves.toBeNull();
    await expect(findTokenConsumedAt(token.uuid)).resolves.toBeNull();
  });

  it('lets only one of two concurrent confirmations with the same token succeed', async () => {
    const user = await insertUnconfirmedUser();
    const token = await insertUsableToken(user.id);

    holdLookupsUntilBothRead();

    const results = await Promise.allSettled([
      useCase.execute({ token: `${token.uuid}.secret` }),
      useCase.execute({ token: `${token.uuid}.secret` }),
    ]);

    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual(['fulfilled', 'rejected']);

    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(rejected?.reason).toBeInstanceOf(InvalidEmailConfirmationTokenError);

    await expect(findEmailConfirmedAt(user.id)).resolves.not.toBeNull();
    await expect(findTokenConsumedAt(token.uuid)).resolves.not.toBeNull();
  });
});
