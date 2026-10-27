import { RefreshTokenEntity } from '../refresh-token.entity';

describe('RefreshTokenEntity', () => {
  it('issues a fresh, unrevoked token', () => {
    const expiresAt = new Date('2026-02-01T00:00:00.000Z');

    const entity = RefreshTokenEntity.issue({
      uuid: 'jti-1',
      userId: 1,
      sessionId: '5d1f6c1e-0b5a-4c8e-9a51-3f8e2b7c4d10',
      tokenHash: 'hashed-token',
      expiresAt,
    });

    expect(entity.id).toBe(0);
    expect(entity.uuid).toBe('jti-1');
    expect(entity.userId).toBe(1);
    expect(entity.sessionId).toBe('5d1f6c1e-0b5a-4c8e-9a51-3f8e2b7c4d10');
    expect(entity.tokenHash).toBe('hashed-token');
    expect(entity.expiresAt).toBe(expiresAt);
    expect(entity.revokedAt).toBeNull();
    expect(entity.replacedByUuid).toBeNull();
  });

  it('reconstitutes a token with every stored field', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const expiresAt = new Date('2026-02-01T00:00:00.000Z');

    const entity = RefreshTokenEntity.reconstitute({
      id: 5,
      uuid: 'jti-5',
      userId: 2,
      sessionId: '5d1f6c1e-0b5a-4c8e-9a51-3f8e2b7c4d10',
      tokenHash: 'hash-5',
      expiresAt,
      revokedAt: null,
      replacedByUuid: null,
      createdAt,
    });

    expect(entity.id).toBe(5);
    expect(entity.uuid).toBe('jti-5');
    expect(entity.userId).toBe(2);
    expect(entity.sessionId).toBe('5d1f6c1e-0b5a-4c8e-9a51-3f8e2b7c4d10');
    expect(entity.createdAt).toBe(createdAt);
  });

  describe('isRevoked', () => {
    function buildToken(revokedAt: Date | null): RefreshTokenEntity {
      return RefreshTokenEntity.reconstitute({
        id: 1,
        uuid: 'jti-1',
        userId: 1,
        sessionId: '5d1f6c1e-0b5a-4c8e-9a51-3f8e2b7c4d10',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt,
        replacedByUuid: null,
        createdAt: new Date(),
      });
    }

    it('is true once the token has been revoked', () => {
      expect(buildToken(new Date()).isRevoked()).toBe(true);
    });

    it('is false for a token that was never revoked', () => {
      expect(buildToken(null).isRevoked()).toBe(false);
    });
  });

  describe('isUsable', () => {
    it('is usable when not revoked and not expired', () => {
      const entity = RefreshTokenEntity.reconstitute({
        id: 1,
        uuid: 'jti-1',
        userId: 1,
        sessionId: '5d1f6c1e-0b5a-4c8e-9a51-3f8e2b7c4d10',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        replacedByUuid: null,
        createdAt: new Date(),
      });

      expect(entity.isUsable(new Date())).toBe(true);
    });

    it('is not usable once revoked', () => {
      const entity = RefreshTokenEntity.reconstitute({
        id: 1,
        uuid: 'jti-1',
        userId: 1,
        sessionId: '5d1f6c1e-0b5a-4c8e-9a51-3f8e2b7c4d10',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        replacedByUuid: 'jti-2',
        createdAt: new Date(),
      });

      expect(entity.isUsable(new Date())).toBe(false);
    });

    it('is not usable once expired', () => {
      const entity = RefreshTokenEntity.reconstitute({
        id: 1,
        uuid: 'jti-1',
        userId: 1,
        sessionId: '5d1f6c1e-0b5a-4c8e-9a51-3f8e2b7c4d10',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1),
        revokedAt: null,
        replacedByUuid: null,
        createdAt: new Date(),
      });

      expect(entity.isUsable(new Date())).toBe(false);
    });
  });
});
