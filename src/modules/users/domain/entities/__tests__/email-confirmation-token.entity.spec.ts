import { EmailConfirmationTokenEntity } from '../email-confirmation-token.entity';

describe('EmailConfirmationTokenEntity', () => {
  it('issues a fresh, unconsumed token', () => {
    const expiresAt = new Date('2026-02-01T00:00:00.000Z');

    const entity = EmailConfirmationTokenEntity.issue({
      uuid: 'token-uuid',
      userId: 1,
      tokenHash: 'hashed-secret',
      expiresAt,
    });

    expect(entity.id).toBe(0);
    expect(entity.uuid).toBe('token-uuid');
    expect(entity.userId).toBe(1);
    expect(entity.tokenHash).toBe('hashed-secret');
    expect(entity.expiresAt).toBe(expiresAt);
    expect(entity.consumedAt).toBeNull();
  });

  it('reconstitutes a token with every stored field', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const expiresAt = new Date('2026-02-01T00:00:00.000Z');

    const entity = EmailConfirmationTokenEntity.reconstitute({
      id: 5,
      uuid: 'token-5',
      userId: 2,
      tokenHash: 'hash-5',
      expiresAt,
      consumedAt: null,
      createdAt,
    });

    expect(entity.id).toBe(5);
    expect(entity.userId).toBe(2);
    expect(entity.createdAt).toBe(createdAt);
  });

  describe('isUsable', () => {
    it('is usable when not consumed and not expired', () => {
      const entity = EmailConfirmationTokenEntity.reconstitute({
        id: 1,
        uuid: 'token-uuid',
        userId: 1,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        createdAt: new Date(),
      });

      expect(entity.isUsable(new Date())).toBe(true);
    });

    it('is not usable once consumed', () => {
      const entity = EmailConfirmationTokenEntity.reconstitute({
        id: 1,
        uuid: 'token-uuid',
        userId: 1,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: new Date(),
        createdAt: new Date(),
      });

      expect(entity.isUsable(new Date())).toBe(false);
    });

    it('is not usable once expired', () => {
      const entity = EmailConfirmationTokenEntity.reconstitute({
        id: 1,
        uuid: 'token-uuid',
        userId: 1,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1),
        consumedAt: null,
        createdAt: new Date(),
      });

      expect(entity.isUsable(new Date())).toBe(false);
    });
  });
});
