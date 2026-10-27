import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { CoreHashingModule } from '@core/hashing';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { Sha256TokenHasher } from '@shared/infrastructure/hashing';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '@modules/users/application/ports/password-hasher.port';
import { USER_REPOSITORY } from '@modules/users/domain/repositories/user.repository';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { TypeOrmUserRepository } from '@modules/users/infrastructure/persistence/repositories/typeorm-user.repository';
import { AbilityOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/ability.orm-entity';
import { RoleOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/role.orm-entity';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from '../../../domain/repositories/password-reset-token.repository';
import { InvalidPasswordResetTokenError } from '../../../domain/errors/invalid-password-reset-token.error';
import { REFRESH_TOKEN_REPOSITORY } from '../../../domain/repositories/refresh-token.repository';
import { PasswordResetTokenOrmEntity } from '../../../infrastructure/persistence/entities/password-reset-token.orm-entity';
import { RefreshTokenOrmEntity } from '../../../infrastructure/persistence/entities/refresh-token.orm-entity';
import { TypeOrmPasswordResetTokenRepository } from '../../../infrastructure/persistence/repositories/typeorm-password-reset-token.repository';
import { TypeOrmRefreshTokenRepository } from '../../../infrastructure/persistence/repositories/typeorm-refresh-token.repository';
import { ResetPasswordUseCase } from '../reset-password.use-case';

// Runs against real Postgres so a failed rollback across the password change,
// token consumption, and refresh-token revocation shows up as leftover rows.
describe('ResetPasswordUseCase (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let useCase: ResetPasswordUseCase;
  let tokenRepository: TypeOrmPasswordResetTokenRepository;
  let refreshTokenRepository: TypeOrmRefreshTokenRepository;

  const stubPasswordHasher: PasswordHasher = {
    hash: (value: string) => Promise.resolve(`hashed:${value}`),
    verify: (hash: string, value: string) =>
      Promise.resolve(hash === `hashed:${value}`),
  };

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
          PasswordResetTokenOrmEntity,
          RefreshTokenOrmEntity,
        ]),
      ],
      providers: [
        ResetPasswordUseCase,
        TypeOrmUserRepository,
        TypeOrmPasswordResetTokenRepository,
        TypeOrmRefreshTokenRepository,
        { provide: USER_REPOSITORY, useExisting: TypeOrmUserRepository },
        {
          provide: PASSWORD_RESET_TOKEN_REPOSITORY,
          useExisting: TypeOrmPasswordResetTokenRepository,
        },
        {
          provide: REFRESH_TOKEN_REPOSITORY,
          useExisting: TypeOrmRefreshTokenRepository,
        },
        { provide: PASSWORD_HASHER, useValue: stubPasswordHasher },
      ],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    useCase = moduleRef.get(ResetPasswordUseCase);
    tokenRepository = moduleRef.get(TypeOrmPasswordResetTokenRepository);
    refreshTokenRepository = moduleRef.get(TypeOrmRefreshTokenRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await dataSource.query(
      'TRUNCATE TABLE "password_reset_tokens", "refresh_tokens", "users" RESTART IDENTITY CASCADE',
    );
  });

  async function insertUser(
    passwordHash: string,
    status: RecordStatus = RecordStatus.ACTIVE,
  ): Promise<UserOrmEntity> {
    const userRepo = dataSource.getRepository(UserOrmEntity);

    return userRepo.save(
      userRepo.create({
        name: 'Jane Doe',
        email: `${randomUUID()}@example.com`,
        password: passwordHash,
        status,
        emailConfirmedAt: null,
        roles: [],
      }),
    );
  }

  async function insertUsableToken(
    userId: number,
    secret: string,
  ): Promise<PasswordResetTokenOrmEntity> {
    const resetTokenRepo = dataSource.getRepository(
      PasswordResetTokenOrmEntity,
    );

    return resetTokenRepo.save(
      resetTokenRepo.create({
        userId,
        tokenHash: tokenHasher.hash(secret),
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
      }),
    );
  }

  async function insertUnrevokedRefreshToken(
    userId: number,
  ): Promise<RefreshTokenOrmEntity> {
    const refreshTokenRepo = dataSource.getRepository(RefreshTokenOrmEntity);

    return refreshTokenRepo.save(
      refreshTokenRepo.create({
        uuid: randomUUID(),
        userId,
        sessionId: randomUUID(),
        tokenHash: tokenHasher.hash(randomUUID()),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        replacedByUuid: null,
      }),
    );
  }

  interface UserRow {
    password: string;
    email_confirmed_at: Date | null;
  }

  async function findUserRow(userId: number): Promise<UserRow> {
    const rows: UserRow[] = await dataSource.query(
      'SELECT password, email_confirmed_at FROM "users" WHERE id = $1',
      [userId],
    );

    return rows[0];
  }

  async function findTokenConsumedAt(uuid: string): Promise<Date | null> {
    const rows: Array<{ consumed_at: Date | null }> = await dataSource.query(
      'SELECT consumed_at FROM "password_reset_tokens" WHERE uuid = $1',
      [uuid],
    );

    return rows[0].consumed_at;
  }

  async function findRefreshRevokedAtByUser(
    userId: number,
  ): Promise<Array<Date | null>> {
    const rows: Array<{ revoked_at: Date | null }> = await dataSource.query(
      'SELECT revoked_at FROM "refresh_tokens" WHERE user_id = $1',
      [userId],
    );

    return rows.map((row) => row.revoked_at);
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

  it('persists every effect (password, email confirmation, token consumption, refresh-token revocation) on the happy path', async () => {
    const user = await insertUser('hashed:old-password');
    const token = await insertUsableToken(user.id, 'secret');
    await insertUnrevokedRefreshToken(user.id);
    await insertUnrevokedRefreshToken(user.id);

    await useCase.execute({
      token: `${token.uuid}.secret`,
      password: 'NewPass',
    });

    const userRow = await findUserRow(user.id);
    expect(userRow.password).toBe('hashed:NewPass');
    expect(userRow.email_confirmed_at).not.toBeNull();

    await expect(findTokenConsumedAt(token.uuid)).resolves.not.toBeNull();

    const revokedAts = await findRefreshRevokedAtByUser(user.id);
    expect(revokedAts).toHaveLength(2);
    expect(revokedAts.every((revokedAt) => revokedAt !== null)).toBe(true);
  });

  it('rejects a wrong secret for an existing token without changing the password or consuming the token', async () => {
    const user = await insertUser('hashed:old-password');
    const token = await insertUsableToken(user.id, 'secret');

    await expect(
      useCase.execute({
        token: `${token.uuid}.wrong-secret`,
        password: 'NewPass',
      }),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);

    const userRow = await findUserRow(user.id);
    expect(userRow.password).toBe('hashed:old-password');

    await expect(findTokenConsumedAt(token.uuid)).resolves.toBeNull();
  });

  it('rejects a valid token for an inactive user without changing the password, confirming the email, consuming the token, or revoking sessions', async () => {
    const user = await insertUser('hashed:old-password', RecordStatus.INACTIVE);
    const token = await insertUsableToken(user.id, 'secret');
    await insertUnrevokedRefreshToken(user.id);

    await expect(
      useCase.execute({ token: `${token.uuid}.secret`, password: 'NewPass' }),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);

    const userRow = await findUserRow(user.id);
    expect(userRow.password).toBe('hashed:old-password');
    expect(userRow.email_confirmed_at).toBeNull();

    await expect(findTokenConsumedAt(token.uuid)).resolves.toBeNull();
    await expect(findRefreshRevokedAtByUser(user.id)).resolves.toEqual([null]);
  });

  it('rolls back every effect when the final write (revokeAllForUser) fails, leaving the token and refresh sessions usable', async () => {
    const user = await insertUser('hashed:old-password');
    const token = await insertUsableToken(user.id, 'secret');
    await insertUnrevokedRefreshToken(user.id);
    await insertUnrevokedRefreshToken(user.id);

    jest
      .spyOn(refreshTokenRepository, 'revokeAllForUser')
      .mockRejectedValueOnce(new Error('boom'));

    await expect(
      useCase.execute({ token: `${token.uuid}.secret`, password: 'NewPass' }),
    ).rejects.toThrow('boom');

    const userRow = await findUserRow(user.id);
    expect(userRow.password).toBe('hashed:old-password');
    expect(userRow.email_confirmed_at).toBeNull();

    await expect(findTokenConsumedAt(token.uuid)).resolves.toBeNull();

    const revokedAts = await findRefreshRevokedAtByUser(user.id);
    expect(revokedAts).toHaveLength(2);
    expect(revokedAts.every((revokedAt) => revokedAt === null)).toBe(true);
  });

  it('rolls back the user update too when a middle write (consumeAllForUser) fails, not just the tail', async () => {
    const user = await insertUser('hashed:old-password');
    const token = await insertUsableToken(user.id, 'secret');

    jest
      .spyOn(tokenRepository, 'consumeAllForUser')
      .mockRejectedValueOnce(new Error('boom'));

    await expect(
      useCase.execute({ token: `${token.uuid}.secret`, password: 'NewPass' }),
    ).rejects.toThrow('boom');

    const userRow = await findUserRow(user.id);
    expect(userRow.password).toBe('hashed:old-password');
    expect(userRow.email_confirmed_at).toBeNull();

    await expect(findTokenConsumedAt(token.uuid)).resolves.toBeNull();
  });

  it('lets only one of two concurrent resets with the same token succeed, keeping the winning password', async () => {
    const user = await insertUser('hashed:old-password');
    const token = await insertUsableToken(user.id, 'secret');

    holdLookupsUntilBothRead();

    const passwords = ['FirstPass', 'SecondPass'];

    const results = await Promise.allSettled(
      passwords.map((password) =>
        useCase.execute({ token: `${token.uuid}.secret`, password }),
      ),
    );

    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual(['fulfilled', 'rejected']);

    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(rejected?.reason).toBeInstanceOf(InvalidPasswordResetTokenError);

    const winningPassword =
      passwords[results.findIndex((result) => result.status === 'fulfilled')];

    const userRow = await findUserRow(user.id);
    expect(userRow.password).toBe(`hashed:${winningPassword}`);
    await expect(findTokenConsumedAt(token.uuid)).resolves.not.toBeNull();
  });

  it('lets only one of two concurrent resets with different tokens for the same user succeed, without deadlocking', async () => {
    const user = await insertUser('hashed:old-password');
    const tokenA = await insertUsableToken(user.id, 'secret-a');
    const tokenB = await insertUsableToken(user.id, 'secret-b');

    holdLookupsUntilBothRead();

    const results = await Promise.allSettled([
      useCase.execute({ token: `${tokenA.uuid}.secret-a`, password: 'APass' }),
      useCase.execute({ token: `${tokenB.uuid}.secret-b`, password: 'BPass' }),
    ]);

    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual(['fulfilled', 'rejected']);

    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(rejected?.reason).toBeInstanceOf(InvalidPasswordResetTokenError);

    await expect(findTokenConsumedAt(tokenA.uuid)).resolves.not.toBeNull();
    await expect(findTokenConsumedAt(tokenB.uuid)).resolves.not.toBeNull();
  });
});
