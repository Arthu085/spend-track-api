import { RefreshTokenEntity } from '../../../../domain/entities/refresh-token.entity';
import { RefreshTokenOrmEntity } from '../../entities/refresh-token.orm-entity';
import { RefreshTokenMapper } from '../refresh-token.mapper';

function buildOrm(): RefreshTokenOrmEntity {
  const orm = new RefreshTokenOrmEntity();
  orm.id = 1;
  orm.uuid = 'jti-1';
  orm.userId = 7;
  orm.sessionId = '5d1f6c1e-0b5a-4c8e-9a51-3f8e2b7c4d10';
  orm.tokenHash = 'hashed-token';
  orm.expiresAt = new Date('2026-02-01T00:00:00.000Z');
  orm.revokedAt = null;
  orm.replacedByUuid = null;
  orm.createdAt = new Date('2026-01-01T00:00:00.000Z');
  return orm;
}

describe('RefreshTokenMapper', () => {
  it('toDomain maps every ORM field onto the domain entity', () => {
    const orm = buildOrm();

    const domain = RefreshTokenMapper.toDomain(orm);

    expect(domain).toBeInstanceOf(RefreshTokenEntity);
    expect(domain.id).toBe(orm.id);
    expect(domain.uuid).toBe(orm.uuid);
    expect(domain.userId).toBe(orm.userId);
    expect(domain.sessionId).toBe(orm.sessionId);
    expect(domain.tokenHash).toBe(orm.tokenHash);
    expect(domain.expiresAt).toBe(orm.expiresAt);
    expect(domain.revokedAt).toBeNull();
    expect(domain.replacedByUuid).toBeNull();
    expect(domain.createdAt).toBe(orm.createdAt);
  });

  it('toOrm maps every domain field onto a fresh ORM row', () => {
    const domain = RefreshTokenEntity.reconstitute({
      id: 3,
      uuid: 'jti-3',
      userId: 9,
      sessionId: '5d1f6c1e-0b5a-4c8e-9a51-3f8e2b7c4d10',
      tokenHash: 'hash-3',
      expiresAt: new Date('2026-03-01T00:00:00.000Z'),
      revokedAt: new Date('2026-02-15T00:00:00.000Z'),
      replacedByUuid: 'jti-4',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const orm = RefreshTokenMapper.toOrm(domain);

    expect(orm.id).toBe(3);
    expect(orm.uuid).toBe('jti-3');
    expect(orm.userId).toBe(9);
    expect(orm.sessionId).toBe('5d1f6c1e-0b5a-4c8e-9a51-3f8e2b7c4d10');
    expect(orm.tokenHash).toBe('hash-3');
    expect(orm.expiresAt).toEqual(new Date('2026-03-01T00:00:00.000Z'));
    expect(orm.revokedAt).toEqual(new Date('2026-02-15T00:00:00.000Z'));
    expect(orm.replacedByUuid).toBe('jti-4');
  });

  it('toOrm omits the id for a not-yet-persisted (id === 0) entity', () => {
    const domain = RefreshTokenEntity.issue({
      uuid: 'jti-new',
      userId: 1,
      sessionId: '5d1f6c1e-0b5a-4c8e-9a51-3f8e2b7c4d10',
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const orm = RefreshTokenMapper.toOrm(domain);

    expect(orm.id).toBeUndefined();
  });
});
