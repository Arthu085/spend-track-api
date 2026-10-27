import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { CoreHashingModule } from '@core/hashing';
import { Sha256TokenHasher } from '@shared/infrastructure/hashing';
import { USER_REPOSITORY } from '@modules/users/domain/repositories/user.repository';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { TypeOrmUserRepository } from '@modules/users/infrastructure/persistence/repositories/typeorm-user.repository';
import { AbilityOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/ability.orm-entity';
import { RoleOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/role.orm-entity';
import { InvalidRefreshTokenError } from '../../../domain/errors/invalid-refresh-token.error';
import { REFRESH_TOKEN_REPOSITORY } from '../../../domain/repositories/refresh-token.repository';
import { RefreshTokenOrmEntity } from '../../../infrastructure/persistence/entities/refresh-token.orm-entity';
import { TypeOrmRefreshTokenRepository } from '../../../infrastructure/persistence/repositories/typeorm-refresh-token.repository';
import {
  TOKEN_SERVICE,
  type AccessTokenPayload,
  type RefreshTokenPayload,
  type TokenService,
} from '../../ports/token-service.port';
import { IssueAuthTokensService } from '../../services/issue-auth-tokens.service';
import { RefreshTokensUseCase } from '../refresh-tokens.use-case';

// Runs against real Postgres so a failed rollback between revoking the old
// refresh token and issuing the new one, or a lost race between concurrent
// refreshes, shows up in the live rows.
describe('RefreshTokensUseCase (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let useCase: RefreshTokensUseCase;
  let refreshTokenRepository: TypeOrmRefreshTokenRepository;
  let verifyRefreshToken: jest.Mock;

  const signedAccessPayloads: AccessTokenPayload[] = [];
  const signedRefreshPayloads: RefreshTokenPayload[] = [];

  const SESSION_ID = randomUUID();
  const RAW_REFRESH_TOKEN = 'raw-refresh-token';
  const NEW_RAW_REFRESH_TOKEN = 'new-raw-refresh-token';
  const tokenHasher = new Sha256TokenHasher();

  beforeAll(async () => {
    verifyRefreshToken = jest.fn();

    const stubTokenService: TokenService = {
      signAccessToken: (payload) => {
        signedAccessPayloads.push(payload);
        return 'new-access-token';
      },
      signRefreshToken: (payload) => {
        signedRefreshPayloads.push(payload);
        return NEW_RAW_REFRESH_TOKEN;
      },
      verifyAccessToken: () => Promise.resolve(null),
      verifyRefreshToken,
      accessTtlMs: () => 900_000,
      refreshTtlMs: () => 604_800_000,
    };

    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        CoreHashingModule,
        TypeOrmModule.forFeature([
          UserOrmEntity,
          RoleOrmEntity,
          AbilityOrmEntity,
          RefreshTokenOrmEntity,
        ]),
      ],
      providers: [
        RefreshTokensUseCase,
        IssueAuthTokensService,
        TypeOrmUserRepository,
        TypeOrmRefreshTokenRepository,
        { provide: USER_REPOSITORY, useExisting: TypeOrmUserRepository },
        {
          provide: REFRESH_TOKEN_REPOSITORY,
          useExisting: TypeOrmRefreshTokenRepository,
        },
        { provide: TOKEN_SERVICE, useValue: stubTokenService },
      ],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    useCase = moduleRef.get(RefreshTokensUseCase);
    refreshTokenRepository = moduleRef.get(TypeOrmRefreshTokenRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    verifyRefreshToken.mockReset();
    signedAccessPayloads.length = 0;
    signedRefreshPayloads.length = 0;
    await dataSource.query(
      'TRUNCATE TABLE "refresh_tokens", "users" RESTART IDENTITY CASCADE',
    );
  });

  async function insertConfirmedUser(): Promise<UserOrmEntity> {
    const userRepo = dataSource.getRepository(UserOrmEntity);

    return userRepo.save(
      userRepo.create({
        name: 'Jane Doe',
        email: `${randomUUID()}@example.com`,
        password: 'hashed:irrelevant',
        emailConfirmedAt: new Date(),
        roles: [],
      }),
    );
  }

  async function insertUsableRefreshToken(
    userId: number,
  ): Promise<RefreshTokenOrmEntity> {
    const refreshTokenRepo = dataSource.getRepository(RefreshTokenOrmEntity);

    return refreshTokenRepo.save(
      refreshTokenRepo.create({
        uuid: randomUUID(),
        userId,
        sessionId: randomUUID(),
        tokenHash: tokenHasher.hash(RAW_REFRESH_TOKEN),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        replacedByUuid: null,
      }),
    );
  }

  async function findLiveRefreshTokenUuids(): Promise<string[]> {
    const rows: Array<{ uuid: string }> = await dataSource.query(
      'SELECT uuid FROM "refresh_tokens" WHERE revoked_at IS NULL',
    );

    return rows.map((row) => row.uuid);
  }

  // Holds every token lookup until both concurrent requests have read the
  // still-active token, so both pass the pre-check and race on the write.
  function holdLookupsUntilBothRead(): void {
    const findByUuid = refreshTokenRepository.findByUuid.bind(
      refreshTokenRepository,
    );

    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => (release = resolve));
    let reads = 0;

    jest
      .spyOn(refreshTokenRepository, 'findByUuid')
      .mockImplementation(async (uuid) => {
        const token = await findByUuid(uuid);
        reads += 1;
        if (reads === 2) release();
        await bothRead;
        return token;
      });
  }

  it('rotates the token on the happy path, leaving exactly one live session pointing back at the replaced row', async () => {
    const user = await insertConfirmedUser();
    const existing = await insertUsableRefreshToken(user.id);

    verifyRefreshToken.mockResolvedValue({
      sub: user.uuid,
      jti: existing.uuid,
      sid: SESSION_ID,
    });

    const result = await useCase.execute({ refreshToken: RAW_REFRESH_TOKEN });

    expect(result.refreshToken).toBe(NEW_RAW_REFRESH_TOKEN);

    const liveUuids = await findLiveRefreshTokenUuids();
    expect(liveUuids).toHaveLength(1);
    expect(liveUuids[0]).not.toBe(existing.uuid);

    const oldRows: Array<{
      revoked_at: Date | null;
      replaced_by_uuid: string | null;
    }> = await dataSource.query(
      'SELECT revoked_at, replaced_by_uuid FROM "refresh_tokens" WHERE uuid = $1',
      [existing.uuid],
    );

    expect(oldRows[0].revoked_at).not.toBeNull();
    expect(oldRows[0].replaced_by_uuid).toBe(liveUuids[0]);

    const newRows: Array<{ token_hash: string }> = await dataSource.query(
      'SELECT token_hash FROM "refresh_tokens" WHERE uuid = $1',
      [liveUuids[0]],
    );

    expect(newRows[0].token_hash).toBe(tokenHasher.hash(NEW_RAW_REFRESH_TOKEN));
  });

  // CSRF tokens are bound to the session id, so rotation must carry it over
  // unchanged or every refresh would invalidate the client's CSRF token.
  it('keeps the session id across rotation and signs it into both new tokens', async () => {
    const user = await insertConfirmedUser();
    const existing = await insertUsableRefreshToken(user.id);

    verifyRefreshToken.mockResolvedValue({
      sub: user.uuid,
      jti: existing.uuid,
      sid: SESSION_ID,
    });

    const result = await useCase.execute({ refreshToken: RAW_REFRESH_TOKEN });

    const [liveUuid] = await findLiveRefreshTokenUuids();

    expect(result.sessionId).toBe(SESSION_ID);
    expect(signedAccessPayloads).toEqual([
      { sub: user.uuid, email: user.email, sid: SESSION_ID },
    ]);
    expect(signedRefreshPayloads).toEqual([
      { sub: user.uuid, jti: liveUuid, sid: SESSION_ID },
    ]);
  });

  it('fails closed on a row still holding a legacy argon2 digest, revoking every session', async () => {
    const user = await insertConfirmedUser();
    const legacy = await insertUsableRefreshToken(user.id);
    await insertUsableRefreshToken(user.id);

    await dataSource.query(
      'UPDATE "refresh_tokens" SET token_hash = $1 WHERE uuid = $2',
      [
        '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG',
        legacy.uuid,
      ],
    );

    verifyRefreshToken.mockResolvedValue({
      sub: user.uuid,
      jti: legacy.uuid,
      sid: SESSION_ID,
    });

    await expect(
      useCase.execute({ refreshToken: RAW_REFRESH_TOKEN }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    expect(await findLiveRefreshTokenUuids()).toHaveLength(0);
  });

  it('revokes every session when the presented token does not match the stored hash', async () => {
    const user = await insertConfirmedUser();
    const existing = await insertUsableRefreshToken(user.id);

    verifyRefreshToken.mockResolvedValue({
      sub: user.uuid,
      jti: existing.uuid,
      sid: SESSION_ID,
    });

    await expect(
      useCase.execute({ refreshToken: 'tampered-refresh-token' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    expect(await findLiveRefreshTokenUuids()).toHaveLength(0);
  });

  it('rolls back the old token revocation when issuing the replacement fails, leaving the original session usable', async () => {
    const user = await insertConfirmedUser();
    const existing = await insertUsableRefreshToken(user.id);

    verifyRefreshToken.mockResolvedValue({
      sub: user.uuid,
      jti: existing.uuid,
      sid: SESSION_ID,
    });

    jest
      .spyOn(refreshTokenRepository, 'create')
      .mockRejectedValueOnce(new Error('boom'));

    await expect(
      useCase.execute({ refreshToken: RAW_REFRESH_TOKEN }),
    ).rejects.toThrow('boom');

    const liveUuids = await findLiveRefreshTokenUuids();
    expect(liveUuids).toEqual([existing.uuid]);
  });

  it('revokes the rotated-to session too when the already-rotated token is replayed', async () => {
    const user = await insertConfirmedUser();
    const existing = await insertUsableRefreshToken(user.id);

    verifyRefreshToken.mockResolvedValue({
      sub: user.uuid,
      jti: existing.uuid,
      sid: SESSION_ID,
    });

    await useCase.execute({ refreshToken: RAW_REFRESH_TOKEN });
    expect(await findLiveRefreshTokenUuids()).toHaveLength(1);

    await expect(
      useCase.execute({ refreshToken: RAW_REFRESH_TOKEN }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    expect(await findLiveRefreshTokenUuids()).toHaveLength(0);
  });

  it("revokes the user's other live sessions when a token revoked without a replacement is replayed", async () => {
    const user = await insertConfirmedUser();
    const revoked = await insertUsableRefreshToken(user.id);
    const otherSession = await insertUsableRefreshToken(user.id);

    await dataSource.query(
      'UPDATE "refresh_tokens" SET revoked_at = now() WHERE uuid = $1',
      [revoked.uuid],
    );

    verifyRefreshToken.mockResolvedValue({
      sub: user.uuid,
      jti: revoked.uuid,
      sid: SESSION_ID,
    });

    expect(await findLiveRefreshTokenUuids()).toEqual([otherSession.uuid]);

    await expect(
      useCase.execute({ refreshToken: RAW_REFRESH_TOKEN }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    expect(await findLiveRefreshTokenUuids()).toHaveLength(0);
  });

  it('lets only one of two concurrent refreshes with the same token succeed, then revokes every session', async () => {
    const user = await insertConfirmedUser();
    const existing = await insertUsableRefreshToken(user.id);

    verifyRefreshToken.mockResolvedValue({
      sub: user.uuid,
      jti: existing.uuid,
      sid: SESSION_ID,
    });

    holdLookupsUntilBothRead();

    const results = await Promise.allSettled([
      useCase.execute({ refreshToken: RAW_REFRESH_TOKEN }),
      useCase.execute({ refreshToken: RAW_REFRESH_TOKEN }),
    ]);

    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual(['fulfilled', 'rejected']);

    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(rejected?.reason).toBeInstanceOf(InvalidRefreshTokenError);

    const rows: Array<{ count: string }> = await dataSource.query(
      'SELECT COUNT(*) AS count FROM "refresh_tokens"',
    );

    expect(Number(rows[0].count)).toBe(2);
    expect(await findLiveRefreshTokenUuids()).toHaveLength(0);
  });
});
