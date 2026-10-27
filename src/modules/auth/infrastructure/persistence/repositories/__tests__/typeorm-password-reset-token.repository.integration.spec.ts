import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CoreConfigModule } from '@core/config';
import { DatabaseModule } from '@core/database';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { PasswordResetTokenEntity } from '../../../../domain/entities/password-reset-token.entity';
import { PasswordResetTokenOrmEntity } from '../../entities/password-reset-token.orm-entity';
import { TypeOrmPasswordResetTokenRepository } from '../typeorm-password-reset-token.repository';

describe('TypeOrmPasswordResetTokenRepository (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let repository: TypeOrmPasswordResetTokenRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        CoreConfigModule,
        DatabaseModule,
        TypeOrmModule.forFeature([PasswordResetTokenOrmEntity, UserOrmEntity]),
      ],
      providers: [TypeOrmPasswordResetTokenRepository],
    }).compile();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    repository = moduleRef.get(TypeOrmPasswordResetTokenRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "password_reset_tokens", "users" RESTART IDENTITY CASCADE',
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

  function buildToken(
    userId: number,
    uuid = randomUUID(),
  ): PasswordResetTokenEntity {
    return PasswordResetTokenEntity.issue({
      uuid,
      userId,
      tokenHash: 'hashed-secret',
      expiresAt: new Date(Date.now() + 60_000),
    });
  }

  it('creates a token row and finds it back by uuid', async () => {
    const user = await insertUser('jane@example.com');
    const token = buildToken(user.id);

    const created = await repository.create(token);

    expect(created.userId).toBe(user.id);
    expect(created.tokenHash).toBe('hashed-secret');

    const found = await repository.findByUuid(token.uuid);

    expect(found?.uuid).toBe(token.uuid);
    expect(found?.userId).toBe(user.id);
  });

  it('findByUuid returns null for an unknown uuid', async () => {
    await expect(repository.findByUuid(randomUUID())).resolves.toBeNull();
  });

  it('consumeIfUnconsumed consumes an unconsumed token', async () => {
    const user = await insertUser('jane@example.com');
    const created = await repository.create(buildToken(user.id));

    await expect(repository.consumeIfUnconsumed(created.uuid)).resolves.toBe(
      true,
    );

    const found = await repository.findByUuid(created.uuid);

    expect(found?.consumedAt).not.toBeNull();
    expect(found?.isUsable(new Date())).toBe(false);
  });

  it('consumeIfUnconsumed loses to an earlier consumption and leaves it untouched', async () => {
    const user = await insertUser('jane@example.com');
    const created = await repository.create(buildToken(user.id));

    await repository.consumeIfUnconsumed(created.uuid);

    const firstConsumedAt = (await repository.findByUuid(created.uuid))
      ?.consumedAt;

    await expect(repository.consumeIfUnconsumed(created.uuid)).resolves.toBe(
      false,
    );

    const secondConsumedAt = (await repository.findByUuid(created.uuid))
      ?.consumedAt;

    expect(secondConsumedAt?.getTime()).toBe(firstConsumedAt?.getTime());
  });

  it('consumeAllForUser consumes every unconsumed token for that user only', async () => {
    const user = await insertUser('jane@example.com');
    const otherUser = await insertUser('john@example.com');

    const tokenA = await repository.create(buildToken(user.id));
    const tokenB = await repository.create(buildToken(user.id));
    const otherToken = await repository.create(buildToken(otherUser.id));

    await repository.consumeAllForUser(user.id);

    const foundA = await repository.findByUuid(tokenA.uuid);
    const foundB = await repository.findByUuid(tokenB.uuid);
    const foundOther = await repository.findByUuid(otherToken.uuid);

    expect(foundA?.consumedAt).not.toBeNull();
    expect(foundB?.consumedAt).not.toBeNull();
    expect(foundOther?.consumedAt).toBeNull();
  });

  it('consumeAllForUser does not re-stamp an already-consumed token', async () => {
    const user = await insertUser('jane@example.com');
    const created = await repository.create(buildToken(user.id));

    await repository.consumeIfUnconsumed(created.uuid);

    const firstConsumedAt = (await repository.findByUuid(created.uuid))
      ?.consumedAt;

    await repository.consumeAllForUser(user.id);

    const secondConsumedAt = (await repository.findByUuid(created.uuid))
      ?.consumedAt;

    expect(secondConsumedAt?.getTime()).toBe(firstConsumedAt?.getTime());
  });

  it('cascades deletion: removing the owning user removes its password-reset tokens', async () => {
    const user = await insertUser('jane@example.com');
    const created = await repository.create(buildToken(user.id));

    await dataSource.getRepository(UserOrmEntity).delete({ id: user.id });

    const rows: Array<{ uuid: string }> = await dataSource.query(
      'SELECT uuid FROM "password_reset_tokens" WHERE uuid = $1',
      [created.uuid],
    );

    expect(rows).toHaveLength(0);
  });

  describe('deleteExpiredBefore', () => {
    const cutoff = new Date('2026-01-10T00:00:00.000Z');

    async function insertExpiringAt(
      userId: number,
      expiresAt: Date,
      overrides: Partial<PasswordResetTokenOrmEntity> = {},
    ): Promise<PasswordResetTokenOrmEntity> {
      const ormRepo = dataSource.getRepository(PasswordResetTokenOrmEntity);

      return ormRepo.save(
        ormRepo.create({
          userId,
          tokenHash: 'hashed-secret',
          expiresAt,
          consumedAt: null,
          ...overrides,
        }),
      );
    }

    async function remainingUuids(): Promise<string[]> {
      const rows: Array<{ uuid: string }> = await dataSource.query(
        'SELECT uuid FROM "password_reset_tokens" ORDER BY id',
      );

      return rows.map((row) => row.uuid);
    }

    it('deletes only rows that expired strictly before the cutoff', async () => {
      const user = await insertUser('jane@example.com');

      await insertExpiringAt(user.id, new Date(cutoff.getTime() - 1));

      const atCutoff = await insertExpiringAt(user.id, cutoff);

      const afterCutoff = await insertExpiringAt(
        user.id,
        new Date(cutoff.getTime() + 1),
      );

      const consumedButNotExpired = await insertExpiringAt(
        user.id,
        new Date(cutoff.getTime() + 60_000),
        { consumedAt: new Date(cutoff.getTime() - 60_000) },
      );

      await expect(repository.deleteExpiredBefore(cutoff, 100)).resolves.toBe(
        1,
      );

      await expect(remainingUuids()).resolves.toEqual([
        atCutoff.uuid,
        afterCutoff.uuid,
        consumedButNotExpired.uuid,
      ]);
    });

    it('deletes at most limit rows per call, oldest first, and is safe to repeat', async () => {
      const user = await insertUser('jane@example.com');
      const expiredAt = new Date(cutoff.getTime() - 60_000);

      await insertExpiringAt(user.id, expiredAt);
      await insertExpiringAt(user.id, expiredAt);

      const newest = await insertExpiringAt(user.id, expiredAt);

      await expect(repository.deleteExpiredBefore(cutoff, 2)).resolves.toBe(2);
      await expect(remainingUuids()).resolves.toEqual([newest.uuid]);
      await expect(repository.deleteExpiredBefore(cutoff, 2)).resolves.toBe(1);
      await expect(repository.deleteExpiredBefore(cutoff, 2)).resolves.toBe(0);
    });
  });
});
