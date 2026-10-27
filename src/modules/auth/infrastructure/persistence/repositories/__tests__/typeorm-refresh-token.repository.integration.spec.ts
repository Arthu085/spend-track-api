import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { RefreshTokenEntity } from '../../../../domain/entities/refresh-token.entity';
import { RefreshTokenOrmEntity } from '../../entities/refresh-token.orm-entity';
import { TypeOrmRefreshTokenRepository } from '../typeorm-refresh-token.repository';

describe('TypeOrmRefreshTokenRepository (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let repository: TypeOrmRefreshTokenRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([RefreshTokenOrmEntity, UserOrmEntity]),
      ],
      providers: [TypeOrmRefreshTokenRepository],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    repository = moduleRef.get(TypeOrmRefreshTokenRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "refresh_tokens", "users" RESTART IDENTITY CASCADE',
    );
  });

  async function insertUser(email: string): Promise<UserOrmEntity> {
    const userRepo = dataSource.getRepository(UserOrmEntity);

    return userRepo.save(
      userRepo.create({
        name: 'Jane Doe',
        email,
        password: 'hashed-password',
        roles: [],
      }),
    );
  }

  function buildToken(userId: number, uuid = randomUUID()): RefreshTokenEntity {
    return RefreshTokenEntity.issue({
      uuid,
      userId,
      sessionId: randomUUID(),
      tokenHash: 'hashed-token',
      expiresAt: new Date(Date.now() + 60_000),
    });
  }

  interface InsertTokenOverrides {
    uuid?: string;
    sessionId?: string;
    expiresAt?: Date;
    revokedAt?: Date | null;
  }

  async function insertToken(
    userId: number,
    overrides: InsertTokenOverrides = {},
  ): Promise<RefreshTokenOrmEntity> {
    const ormRepo = dataSource.getRepository(RefreshTokenOrmEntity);

    return ormRepo.save(
      ormRepo.create({
        uuid: overrides.uuid ?? randomUUID(),
        userId,
        sessionId: overrides.sessionId ?? randomUUID(),
        tokenHash: 'hashed-token',
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
        revokedAt: overrides.revokedAt ?? null,
        replacedByUuid: null,
      }),
    );
  }

  it('creates a refresh token row and finds it back by uuid', async () => {
    const user = await insertUser('jane@example.com');
    const token = buildToken(user.id);

    const created = await repository.create(token);

    expect(created.userId).toBe(user.id);
    expect(created.tokenHash).toBe('hashed-token');

    const found = await repository.findByUuid(token.uuid);

    expect(found?.uuid).toBe(token.uuid);
    expect(found?.userId).toBe(user.id);
  });

  it('findByUuid returns null for an unknown uuid', async () => {
    await expect(repository.findByUuid(randomUUID())).resolves.toBeNull();
  });

  it('revokeIfActive revokes an active token and records its replacement', async () => {
    const user = await insertUser('jane@example.com');
    const created = await repository.create(buildToken(user.id));

    const replacementUuid = randomUUID();

    await expect(
      repository.revokeIfActive(created.uuid, replacementUuid),
    ).resolves.toBe(true);

    const found = await repository.findByUuid(created.uuid);

    expect(found?.revokedAt).not.toBeNull();
    expect(found?.replacedByUuid).toBe(replacementUuid);
    expect(found?.isUsable(new Date())).toBe(false);
  });

  it('revokeIfActive loses to an earlier revocation and leaves it untouched', async () => {
    const user = await insertUser('jane@example.com');
    const created = await repository.create(buildToken(user.id));

    const firstReplacementUuid = randomUUID();
    await repository.revokeIfActive(created.uuid, firstReplacementUuid);

    await expect(
      repository.revokeIfActive(created.uuid, randomUUID()),
    ).resolves.toBe(false);

    const found = await repository.findByUuid(created.uuid);

    expect(found?.replacedByUuid).toBe(firstReplacementUuid);
  });

  it('revokeAllForUser revokes every non-revoked token for that user only', async () => {
    const user = await insertUser('jane@example.com');
    const otherUser = await insertUser('john@example.com');

    const tokenA = await repository.create(buildToken(user.id));
    const tokenB = await repository.create(buildToken(user.id));
    const otherToken = await repository.create(buildToken(otherUser.id));

    await repository.revokeAllForUser(user.id);

    const foundA = await repository.findByUuid(tokenA.uuid);
    const foundB = await repository.findByUuid(tokenB.uuid);
    const foundOther = await repository.findByUuid(otherToken.uuid);

    expect(foundA?.revokedAt).not.toBeNull();
    expect(foundB?.revokedAt).not.toBeNull();
    expect(foundOther?.revokedAt).toBeNull();
  });

  it('revokeAllForUser does not re-stamp an already-revoked token', async () => {
    const user = await insertUser('jane@example.com');
    const created = await repository.create(buildToken(user.id));

    await repository.revokeIfActive(created.uuid, randomUUID());

    const firstRevokedAt = (await repository.findByUuid(created.uuid))
      ?.revokedAt;

    await repository.revokeAllForUser(user.id);

    const secondRevokedAt = (await repository.findByUuid(created.uuid))
      ?.revokedAt;

    expect(secondRevokedAt?.getTime()).toBe(firstRevokedAt?.getTime());
  });

  describe('hasActiveSession', () => {
    it('is true while the session has an unrevoked, unexpired row', async () => {
      const user = await insertUser('jane@example.com');
      const sessionId = randomUUID();
      await insertToken(user.id, { sessionId, revokedAt: new Date() });
      await insertToken(user.id, { sessionId });

      await expect(
        repository.hasActiveSession(user.id, sessionId, new Date()),
      ).resolves.toBe(true);
    });

    it('is false once every row of the session is revoked', async () => {
      const user = await insertUser('jane@example.com');
      const sessionId = randomUUID();
      await insertToken(user.id, { sessionId });

      await repository.revokeAllForUser(user.id);

      await expect(
        repository.hasActiveSession(user.id, sessionId, new Date()),
      ).resolves.toBe(false);
    });

    it('is false when the only live row has expired', async () => {
      const user = await insertUser('jane@example.com');
      const sessionId = randomUUID();
      await insertToken(user.id, {
        sessionId,
        expiresAt: new Date(Date.now() - 1_000),
      });

      await expect(
        repository.hasActiveSession(user.id, sessionId, new Date()),
      ).resolves.toBe(false);
    });

    it('ignores live rows of other sessions and of other users', async () => {
      const user = await insertUser('jane@example.com');
      const otherUser = await insertUser('john@example.com');
      const sessionId = randomUUID();
      await insertToken(user.id);
      await insertToken(otherUser.id, { sessionId });

      await expect(
        repository.hasActiveSession(user.id, sessionId, new Date()),
      ).resolves.toBe(false);
    });
  });

  it('cascades deletion: removing the owning user removes its refresh tokens', async () => {
    const user = await insertUser('jane@example.com');
    const created = await repository.create(buildToken(user.id));

    await dataSource.getRepository(UserOrmEntity).delete({ id: user.id });

    const rows: Array<{ uuid: string }> = await dataSource.query(
      'SELECT uuid FROM "refresh_tokens" WHERE uuid = $1',
      [created.uuid],
    );

    expect(rows).toHaveLength(0);
  });

  describe('deleteExpiredBefore', () => {
    it('removes only rows whose expiresAt is before the given date', async () => {
      const user = await insertUser('jane@example.com');
      const now = new Date();

      const expired = await insertToken(user.id, {
        expiresAt: new Date(now.getTime() - 60 * 60 * 1000),
      });

      const future = await insertToken(user.id, {
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      });

      const deletedCount = await repository.deleteExpiredBefore(now);

      expect(deletedCount).toBe(1);
      await expect(repository.findByUuid(expired.uuid)).resolves.toBeNull();
      await expect(repository.findByUuid(future.uuid)).resolves.not.toBeNull();
    });

    it('removes expired rows regardless of revoked state', async () => {
      const user = await insertUser('jane@example.com');
      const now = new Date();

      const expiredAndRevoked = await insertToken(user.id, {
        expiresAt: new Date(now.getTime() - 60 * 60 * 1000),
        revokedAt: new Date(now.getTime() - 30 * 60 * 1000),
      });

      const deletedCount = await repository.deleteExpiredBefore(now);

      expect(deletedCount).toBe(1);
      await expect(
        repository.findByUuid(expiredAndRevoked.uuid),
      ).resolves.toBeNull();
    });

    it('returns 0 when there are no matching rows', async () => {
      await expect(repository.deleteExpiredBefore(new Date())).resolves.toBe(0);
    });

    it('does not touch another user valid token', async () => {
      const user = await insertUser('jane@example.com');
      const otherUser = await insertUser('john@example.com');
      const now = new Date();

      await insertToken(user.id, {
        expiresAt: new Date(now.getTime() - 60 * 60 * 1000),
      });

      const otherValidToken = await insertToken(otherUser.id, {
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      });

      await repository.deleteExpiredBefore(now);

      await expect(
        repository.findByUuid(otherValidToken.uuid),
      ).resolves.not.toBeNull();
    });
  });

  describe('deleteRevokedBefore', () => {
    it('removes only rows revoked before the threshold, keeping never-revoked rows', async () => {
      const user = await insertUser('jane@example.com');
      const now = new Date();

      const farFutureExpiry = new Date(
        now.getTime() + 365 * 24 * 60 * 60 * 1000,
      );

      const revokedLongAgo = await insertToken(user.id, {
        expiresAt: farFutureExpiry,
        revokedAt: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000),
      });

      const revokedRecently = await insertToken(user.id, {
        expiresAt: farFutureExpiry,
        revokedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      });

      const neverRevoked = await insertToken(user.id, {
        expiresAt: farFutureExpiry,
        revokedAt: null,
      });

      const threshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const deletedCount = await repository.deleteRevokedBefore(threshold);

      expect(deletedCount).toBe(1);
      await expect(
        repository.findByUuid(revokedLongAgo.uuid),
      ).resolves.toBeNull();
      await expect(
        repository.findByUuid(revokedRecently.uuid),
      ).resolves.not.toBeNull();
      await expect(
        repository.findByUuid(neverRevoked.uuid),
      ).resolves.not.toBeNull();
    });

    it('returns 0 when there are no matching rows', async () => {
      await expect(repository.deleteRevokedBefore(new Date())).resolves.toBe(0);
    });

    it('hard-deletes rows, bypassing soft-delete semantics', async () => {
      const user = await insertUser('jane@example.com');
      const now = new Date();

      const expired = await insertToken(user.id, {
        expiresAt: new Date(now.getTime() - 60 * 60 * 1000),
      });

      await repository.deleteExpiredBefore(now);

      const rows: Array<{ uuid: string }> = await dataSource.query(
        'SELECT * FROM "refresh_tokens" WHERE uuid = $1',
        [expired.uuid],
      );

      expect(rows).toHaveLength(0);
    });

    it('does not touch another user valid token', async () => {
      const user = await insertUser('jane@example.com');
      const otherUser = await insertUser('john@example.com');
      const now = new Date();

      const farFutureExpiry = new Date(
        now.getTime() + 365 * 24 * 60 * 60 * 1000,
      );

      await insertToken(user.id, {
        expiresAt: farFutureExpiry,
        revokedAt: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000),
      });

      const otherValidToken = await insertToken(otherUser.id, {
        expiresAt: farFutureExpiry,
        revokedAt: null,
      });

      await repository.deleteRevokedBefore(
        new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      );

      await expect(
        repository.findByUuid(otherValidToken.uuid),
      ).resolves.not.toBeNull();
    });
  });
});
