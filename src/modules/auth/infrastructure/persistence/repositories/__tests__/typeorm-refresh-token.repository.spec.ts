import type { Repository } from 'typeorm';
import { IsNull, LessThan, MoreThan } from 'typeorm';
import { RefreshTokenEntity } from '../../../../domain/entities/refresh-token.entity';
import { RefreshTokenOrmEntity } from '../../entities/refresh-token.orm-entity';
import { TypeOrmRefreshTokenRepository } from '../typeorm-refresh-token.repository';

function buildOrm(): RefreshTokenOrmEntity {
  const orm = new RefreshTokenOrmEntity();
  orm.id = 1;
  orm.uuid = 'jti-1';
  orm.userId = 1;
  orm.sessionId = '5d1f6c1e-0b5a-4c8e-9a51-3f8e2b7c4d10';
  orm.tokenHash = 'hashed-token';
  orm.expiresAt = new Date(Date.now() + 60_000);
  orm.revokedAt = null;
  orm.replacedByUuid = null;
  orm.createdAt = new Date();
  return orm;
}

function buildDomain(): RefreshTokenEntity {
  return RefreshTokenEntity.issue({
    uuid: 'jti-1',
    userId: 1,
    sessionId: '5d1f6c1e-0b5a-4c8e-9a51-3f8e2b7c4d10',
    tokenHash: 'hashed-token',
    expiresAt: new Date(Date.now() + 60_000),
  });
}

describe('TypeOrmRefreshTokenRepository', () => {
  it('create saves the mapped entity and returns the mapped domain result', async () => {
    const save = jest.fn().mockResolvedValue(buildOrm());

    const repository = {
      save,
    } as unknown as Repository<RefreshTokenOrmEntity>;

    const adapter = new TypeOrmRefreshTokenRepository(repository);

    const result = await adapter.create(buildDomain());

    expect(save).toHaveBeenCalledTimes(1);
    expect(result).toBeInstanceOf(RefreshTokenEntity);
    expect(result.uuid).toBe('jti-1');
  });

  it('findByUuid returns null when no row matches', async () => {
    const findOne = jest.fn().mockResolvedValue(null);

    const repository = {
      findOne,
    } as unknown as Repository<RefreshTokenOrmEntity>;

    const adapter = new TypeOrmRefreshTokenRepository(repository);

    await expect(adapter.findByUuid('missing')).resolves.toBeNull();
    expect(findOne).toHaveBeenCalledWith({ where: { uuid: 'missing' } });
  });

  it('findByUuid maps the row to a domain entity when found', async () => {
    const findOne = jest.fn().mockResolvedValue(buildOrm());

    const repository = {
      findOne,
    } as unknown as Repository<RefreshTokenOrmEntity>;

    const adapter = new TypeOrmRefreshTokenRepository(repository);

    const result = await adapter.findByUuid('jti-1');

    expect(result).toBeInstanceOf(RefreshTokenEntity);
    expect(result?.uuid).toBe('jti-1');
  });

  it('revokeIfActive revokes only a not-yet-revoked row and reports whether it won', async () => {
    const update = jest.fn().mockResolvedValue({ affected: 1 });

    const repository = {
      update,
    } as unknown as Repository<RefreshTokenOrmEntity>;

    const adapter = new TypeOrmRefreshTokenRepository(repository);

    await expect(adapter.revokeIfActive('jti-1', 'jti-2')).resolves.toBe(true);

    const [criteria, patch] = update.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];

    expect(criteria).toEqual({ uuid: 'jti-1', revokedAt: IsNull() });
    expect(patch.revokedAt).toBeInstanceOf(Date);
    expect(patch.replacedByUuid).toBe('jti-2');
  });

  it('revokeIfActive returns false when no row was updated', async () => {
    const update = jest.fn().mockResolvedValue({ affected: 0 });

    const repository = {
      update,
    } as unknown as Repository<RefreshTokenOrmEntity>;

    const adapter = new TypeOrmRefreshTokenRepository(repository);

    await expect(adapter.revokeIfActive('jti-1', 'jti-2')).resolves.toBe(false);
  });

  it('revokeAllForUser updates every non-revoked row for the user', async () => {
    const update = jest.fn().mockResolvedValue(undefined);

    const repository = {
      update,
    } as unknown as Repository<RefreshTokenOrmEntity>;

    const adapter = new TypeOrmRefreshTokenRepository(repository);

    await adapter.revokeAllForUser(7);

    expect(update).toHaveBeenCalledTimes(1);

    const [criteria, patch] = update.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];

    expect(criteria).toMatchObject({ userId: 7 });
    expect(patch.revokedAt).toBeInstanceOf(Date);
  });

  it('hasActiveSession checks for an unrevoked, unexpired row of the session owned by the user', async () => {
    const now = new Date('2026-07-29T12:00:00.000Z');
    const existsBy = jest.fn().mockResolvedValue(true);

    const repository = {
      existsBy,
    } as unknown as Repository<RefreshTokenOrmEntity>;

    const adapter = new TypeOrmRefreshTokenRepository(repository);

    await expect(
      adapter.hasActiveSession(7, '5d1f6c1e-0b5a-4c8e-9a51-3f8e2b7c4d10', now),
    ).resolves.toBe(true);
    expect(existsBy).toHaveBeenCalledWith({
      userId: 7,
      sessionId: '5d1f6c1e-0b5a-4c8e-9a51-3f8e2b7c4d10',
      revokedAt: IsNull(),
      expiresAt: MoreThan(now),
    });
  });

  it('deleteExpiredBefore deletes rows whose expiresAt is before the given date', async () => {
    const now = new Date('2026-07-29T12:00:00.000Z');
    const deleteMock = jest.fn().mockResolvedValue({ affected: 3 });

    const repository = {
      delete: deleteMock,
    } as unknown as Repository<RefreshTokenOrmEntity>;

    const adapter = new TypeOrmRefreshTokenRepository(repository);

    const result = await adapter.deleteExpiredBefore(now);

    expect(deleteMock).toHaveBeenCalledWith({ expiresAt: LessThan(now) });
    expect(result).toBe(3);
  });

  it('deleteExpiredBefore returns 0 when affected is null', async () => {
    const now = new Date('2026-07-29T12:00:00.000Z');
    const deleteMock = jest.fn().mockResolvedValue({ affected: null });

    const repository = {
      delete: deleteMock,
    } as unknown as Repository<RefreshTokenOrmEntity>;

    const adapter = new TypeOrmRefreshTokenRepository(repository);

    const result = await adapter.deleteExpiredBefore(now);

    expect(result).toBe(0);
  });

  it('deleteExpiredBefore returns 0 when affected is undefined', async () => {
    const now = new Date('2026-07-29T12:00:00.000Z');
    const deleteMock = jest.fn().mockResolvedValue({ affected: undefined });

    const repository = {
      delete: deleteMock,
    } as unknown as Repository<RefreshTokenOrmEntity>;

    const adapter = new TypeOrmRefreshTokenRepository(repository);

    const result = await adapter.deleteExpiredBefore(now);

    expect(result).toBe(0);
  });

  it('deleteRevokedBefore deletes rows whose revokedAt is before the given threshold', async () => {
    const threshold = new Date('2026-06-29T12:00:00.000Z');
    const deleteMock = jest.fn().mockResolvedValue({ affected: 2 });

    const repository = {
      delete: deleteMock,
    } as unknown as Repository<RefreshTokenOrmEntity>;

    const adapter = new TypeOrmRefreshTokenRepository(repository);

    const result = await adapter.deleteRevokedBefore(threshold);

    expect(deleteMock).toHaveBeenCalledWith({
      revokedAt: LessThan(threshold),
    });
    expect(result).toBe(2);
  });

  it('deleteRevokedBefore returns 0 when affected is null', async () => {
    const threshold = new Date('2026-06-29T12:00:00.000Z');
    const deleteMock = jest.fn().mockResolvedValue({ affected: null });

    const repository = {
      delete: deleteMock,
    } as unknown as Repository<RefreshTokenOrmEntity>;

    const adapter = new TypeOrmRefreshTokenRepository(repository);

    const result = await adapter.deleteRevokedBefore(threshold);

    expect(result).toBe(0);
  });

  it('deleteRevokedBefore returns 0 when affected is undefined', async () => {
    const threshold = new Date('2026-06-29T12:00:00.000Z');
    const deleteMock = jest.fn().mockResolvedValue({ affected: undefined });

    const repository = {
      delete: deleteMock,
    } as unknown as Repository<RefreshTokenOrmEntity>;

    const adapter = new TypeOrmRefreshTokenRepository(repository);

    const result = await adapter.deleteRevokedBefore(threshold);

    expect(result).toBe(0);
  });
});
