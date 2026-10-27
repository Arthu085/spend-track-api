import { RefreshTokenEntity } from '../../../domain/entities/refresh-token.entity';
import { RefreshTokenOrmEntity } from '../entities/refresh-token.orm-entity';

export class RefreshTokenMapper {
  static toDomain(orm: RefreshTokenOrmEntity): RefreshTokenEntity {
    return RefreshTokenEntity.reconstitute({
      id: orm.id,
      uuid: orm.uuid,
      userId: orm.userId,
      sessionId: orm.sessionId,
      tokenHash: orm.tokenHash,
      expiresAt: orm.expiresAt,
      revokedAt: orm.revokedAt,
      replacedByUuid: orm.replacedByUuid,
      createdAt: orm.createdAt,
    });
  }

  static toOrm(domain: RefreshTokenEntity): RefreshTokenOrmEntity {
    const orm = new RefreshTokenOrmEntity();

    if (domain.id > 0) {
      orm.id = domain.id;
    }

    orm.uuid = domain.uuid;
    orm.userId = domain.userId;
    orm.sessionId = domain.sessionId;
    orm.tokenHash = domain.tokenHash;
    orm.expiresAt = domain.expiresAt;
    orm.revokedAt = domain.revokedAt;
    orm.replacedByUuid = domain.replacedByUuid;

    return orm;
  }
}
