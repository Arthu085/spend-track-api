import { EmailConfirmationTokenEntity } from '../../../../domain/entities/email-confirmation-token.entity';
import { EmailConfirmationTokenOrmEntity } from '../../entities/email-confirmation-token.orm-entity';
import { EmailConfirmationTokenMapper } from '../email-confirmation-token.mapper';

function buildOrm(): EmailConfirmationTokenOrmEntity {
  const orm = new EmailConfirmationTokenOrmEntity();
  orm.id = 1;
  orm.uuid = 'token-uuid';
  orm.userId = 7;
  orm.tokenHash = 'hashed-secret';
  orm.expiresAt = new Date('2026-02-01T00:00:00.000Z');
  orm.consumedAt = null;
  orm.createdAt = new Date('2026-01-01T00:00:00.000Z');
  return orm;
}

describe('EmailConfirmationTokenMapper', () => {
  it('toDomain maps every ORM field onto the domain entity', () => {
    const orm = buildOrm();

    const domain = EmailConfirmationTokenMapper.toDomain(orm);

    expect(domain).toBeInstanceOf(EmailConfirmationTokenEntity);
    expect(domain.id).toBe(orm.id);
    expect(domain.uuid).toBe(orm.uuid);
    expect(domain.userId).toBe(orm.userId);
    expect(domain.tokenHash).toBe(orm.tokenHash);
    expect(domain.expiresAt).toBe(orm.expiresAt);
    expect(domain.consumedAt).toBeNull();
    expect(domain.createdAt).toBe(orm.createdAt);
  });

  it('toOrm maps every domain field onto a fresh ORM row', () => {
    const domain = EmailConfirmationTokenEntity.reconstitute({
      id: 3,
      uuid: 'token-3',
      userId: 9,
      tokenHash: 'hash-3',
      expiresAt: new Date('2026-03-01T00:00:00.000Z'),
      consumedAt: new Date('2026-02-15T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const orm = EmailConfirmationTokenMapper.toOrm(domain);

    expect(orm.id).toBe(3);
    expect(orm.uuid).toBe('token-3');
    expect(orm.userId).toBe(9);
    expect(orm.tokenHash).toBe('hash-3');
    expect(orm.expiresAt).toEqual(new Date('2026-03-01T00:00:00.000Z'));
    expect(orm.consumedAt).toEqual(new Date('2026-02-15T00:00:00.000Z'));
  });

  it('toOrm omits the id for a not-yet-persisted (id === 0) entity', () => {
    const domain = EmailConfirmationTokenEntity.issue({
      uuid: 'token-new',
      userId: 1,
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const orm = EmailConfirmationTokenMapper.toOrm(domain);

    expect(orm.id).toBeUndefined();
  });
});
