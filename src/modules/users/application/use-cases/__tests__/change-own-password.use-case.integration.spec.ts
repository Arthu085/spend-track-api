import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { AbilityOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/ability.orm-entity';
import { RoleOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/role.orm-entity';
import { PasswordResetTokenPasswordChangeRevoker } from '@modules/auth/application/services/password-reset-token-password-change-revoker';
import { RefreshTokenSessionRevoker } from '@modules/auth/application/services/refresh-token-session-revoker';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from '@modules/auth/domain/repositories/password-reset-token.repository';
import { REFRESH_TOKEN_REPOSITORY } from '@modules/auth/domain/repositories/refresh-token.repository';
import { PasswordResetTokenOrmEntity } from '@modules/auth/infrastructure/persistence/entities/password-reset-token.orm-entity';
import { RefreshTokenOrmEntity } from '@modules/auth/infrastructure/persistence/entities/refresh-token.orm-entity';
import { TypeOrmPasswordResetTokenRepository } from '@modules/auth/infrastructure/persistence/repositories/typeorm-password-reset-token.repository';
import { TypeOrmRefreshTokenRepository } from '@modules/auth/infrastructure/persistence/repositories/typeorm-refresh-token.repository';
import { InvalidCurrentPasswordError } from '../../../domain/errors/invalid-current-password.error';
import { USER_REPOSITORY } from '../../../domain/repositories/user.repository';
import { Argon2PasswordHasher } from '../../../infrastructure/hashing/argon2-password-hasher';
import { UserOrmEntity } from '../../../infrastructure/persistence/entities/user.orm-entity';
import { TypeOrmUserRepository } from '../../../infrastructure/persistence/repositories/typeorm-user.repository';
import { PASSWORD_CHANGE_TOKEN_REVOKERS } from '../../ports/password-change-token-revoker.port';
import { PASSWORD_HASHER } from '../../ports/password-hasher.port';
import { USER_SESSION_REVOKERS } from '../../ports/user-session-revoker.port';
import { PasswordChangeTokenRevokers } from '../../services/password-change-token-revokers';
import { UserSessionRevokers } from '../../services/user-session-revokers';
import { ChangeOwnPasswordUseCase } from '../change-own-password.use-case';

const CURRENT_PASSWORD = 'Secret123!';
const NEW_PASSWORD = 'N3wSecret123!';

// Wires both users registries to the real auth revokers against Postgres, so a
// refresh or reset token that survives a password change, or a change that
// escapes the rollback, shows up in live rows.
describe('ChangeOwnPasswordUseCase (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let changeOwnPassword: ChangeOwnPasswordUseCase;
  let hasher: Argon2PasswordHasher;
  let refreshTokens: TypeOrmRefreshTokenRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([
          UserOrmEntity,
          RoleOrmEntity,
          AbilityOrmEntity,
          RefreshTokenOrmEntity,
          PasswordResetTokenOrmEntity,
        ]),
      ],
      providers: [
        ChangeOwnPasswordUseCase,
        Argon2PasswordHasher,
        RefreshTokenSessionRevoker,
        PasswordResetTokenPasswordChangeRevoker,
        TypeOrmRefreshTokenRepository,
        { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
        { provide: PASSWORD_HASHER, useExisting: Argon2PasswordHasher },
        {
          provide: REFRESH_TOKEN_REPOSITORY,
          useExisting: TypeOrmRefreshTokenRepository,
        },
        {
          provide: PASSWORD_RESET_TOKEN_REPOSITORY,
          useClass: TypeOrmPasswordResetTokenRepository,
        },
        {
          provide: PASSWORD_CHANGE_TOKEN_REVOKERS,
          useClass: PasswordChangeTokenRevokers,
        },
        { provide: USER_SESSION_REVOKERS, useClass: UserSessionRevokers },
      ],
    }).compile();

    // Runs `onModuleInit`, which registers both auth revokers.
    await moduleRef.init();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    changeOwnPassword = moduleRef.get(ChangeOwnPasswordUseCase);
    hasher = moduleRef.get(Argon2PasswordHasher);
    refreshTokens = moduleRef.get(TypeOrmRefreshTokenRepository);
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

  async function insertUser(): Promise<number> {
    const repo = dataSource.getRepository(UserOrmEntity);

    const saved = await repo.save(
      repo.create({
        name: 'Jane Doe',
        email: `${randomUUID()}@example.com`,
        password: await hasher.hash(CURRENT_PASSWORD),
        emailConfirmedAt: new Date(),
      }),
    );

    return saved.id;
  }

  async function insertTokens(userId: number): Promise<void> {
    const refreshRepo = dataSource.getRepository(RefreshTokenOrmEntity);
    const resetRepo = dataSource.getRepository(PasswordResetTokenOrmEntity);

    for (let index = 0; index < 2; index++) {
      await refreshRepo.save(
        refreshRepo.create({
          userId,
          sessionId: randomUUID(),
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
        }),
      );
      await resetRepo.save(
        resetRepo.create({
          userId,
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: null,
        }),
      );
    }
  }

  async function findPasswordHash(userId: number): Promise<string> {
    const rows: Array<{ password: string }> = await dataSource.query(
      'SELECT password FROM "users" WHERE id = $1',
      [userId],
    );

    return rows[0].password;
  }

  async function countLiveTokens(
    userId: number,
  ): Promise<{ refresh: number; reset: number }> {
    const rows: Array<{ refresh: number; reset: number }> =
      await dataSource.query(
        `SELECT (SELECT count(*)::int FROM "refresh_tokens" WHERE user_id = $1 AND revoked_at IS NULL) AS refresh,
                (SELECT count(*)::int FROM "password_reset_tokens" WHERE user_id = $1 AND consumed_at IS NULL) AS reset`,
        [userId],
      );

    return rows[0];
  }

  it('stores the new argon2 hash and ends every session and reset link of the user, and only theirs', async () => {
    const userId = await insertUser();
    const otherId = await insertUser();
    await insertTokens(userId);
    await insertTokens(otherId);

    await changeOwnPassword.execute({
      actorId: userId,
      currentPassword: CURRENT_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    const stored = await findPasswordHash(userId);
    await expect(hasher.verify(stored, NEW_PASSWORD)).resolves.toBe(true);
    await expect(hasher.verify(stored, CURRENT_PASSWORD)).resolves.toBe(false);

    await expect(countLiveTokens(userId)).resolves.toEqual({
      refresh: 0,
      reset: 0,
    });
    await expect(countLiveTokens(otherId)).resolves.toEqual({
      refresh: 2,
      reset: 2,
    });
  });

  it('leaves the password and tokens untouched when the current password is wrong', async () => {
    const userId = await insertUser();
    await insertTokens(userId);
    const before = await findPasswordHash(userId);

    await expect(
      changeOwnPassword.execute({
        actorId: userId,
        currentPassword: 'NotThePassword1!',
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(InvalidCurrentPasswordError);

    await expect(findPasswordHash(userId)).resolves.toBe(before);
    await expect(countLiveTokens(userId)).resolves.toEqual({
      refresh: 2,
      reset: 2,
    });
  });

  it('rolls the change back when the session revocation fails, keeping the old password and every token', async () => {
    const userId = await insertUser();
    await insertTokens(userId);
    const before = await findPasswordHash(userId);

    jest
      .spyOn(refreshTokens, 'revokeAllForUser')
      .mockRejectedValueOnce(new Error('boom'));

    await expect(
      changeOwnPassword.execute({
        actorId: userId,
        currentPassword: CURRENT_PASSWORD,
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toThrow('boom');

    await expect(findPasswordHash(userId)).resolves.toBe(before);
    await expect(countLiveTokens(userId)).resolves.toEqual({
      refresh: 2,
      reset: 2,
    });
  });
});
