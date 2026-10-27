import { PasswordResetTokenEntity } from '../../../../domain/entities/password-reset-token.entity';
import { PasswordResetTokenOrmEntity } from '../../entities/password-reset-token.orm-entity';
import { PasswordResetTokenMapper } from '../password-reset-token.mapper';

function buildOrm(): PasswordResetTokenOrmEntity {
  const orm = new PasswordResetTokenOrmEntity();
  orm.id = 1;
  orm.uuid = 'token-uuid';
  orm.userId = 7;
  orm.tokenHash = 'hashed-secret';
  orm.expiresAt = new Date('2026-02-01T00:00:00.000Z');
  orm.consumedAt = null;
  orm.createdAt = new Date('2026-01-01T00:00:00.000Z');
  return orm;
}

describe('PasswordResetTokenMapper', () => {
  it('toDomain maps every ORM field onto the domain entity', () => {
    const orm = buildOrm();

    const domain = PasswordResetTokenMapper.toDomain(orm);

    expect(domain).toBeInstanceOf(PasswordResetTokenEntity);
    expect(domain.id).toBe(orm.id);
    expect(domain.uuid).toBe(orm.uuid);
    expect(domain.userId).toBe(orm.userId);
    expect(domain.tokenHash).toBe(orm.tokenHash);
    expect(domain.expiresAt).toBe(orm.expiresAt);
    expect(domain.consumedAt).toBeNull();
    expect(domain.createdAt).toBe(orm.createdAt);
  });

  it('toOrm maps every domain field onto a fresh ORM row', () => {
    const domain = PasswordResetTokenEntity.reconstitute({
      id: 3,
      uuid: 'token-3',
      userId: 9,
      tokenHash: 'hash-3',
      expiresAt: new Date('2026-03-01T00:00:00.000Z'),
      consumedAt: new Date('2026-02-15T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const orm = PasswordResetTokenMapper.toOrm(domain);

    expect(orm.id).toBe(3);
    expect(orm.uuid).toBe('token-3');
    expect(orm.userId).toBe(9);
    expect(orm.tokenHash).toBe('hash-3');
    expect(orm.expiresAt).toEqual(new Date('2026-03-01T00:00:00.000Z'));
    expect(orm.consumedAt).toEqual(new Date('2026-02-15T00:00:00.000Z'));
  });

  it('toOrm omits the id for a not-yet-persisted (id === 0) entity', () => {
    const domain = PasswordResetTokenEntity.issue({
      uuid: 'token-new',
      userId: 1,
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const orm = PasswordResetTokenMapper.toOrm(domain);

    expect(orm.id).toBeUndefined();
  });
});
