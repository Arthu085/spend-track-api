import { PasswordResetTokenEntity } from '../../../domain/entities/password-reset-token.entity';
import { PasswordResetTokenOrmEntity } from '../entities/password-reset-token.orm-entity';

export class PasswordResetTokenMapper {
  static toDomain(orm: PasswordResetTokenOrmEntity): PasswordResetTokenEntity {
    return PasswordResetTokenEntity.reconstitute({
      id: orm.id,
      uuid: orm.uuid,
      userId: orm.userId,
      tokenHash: orm.tokenHash,
      expiresAt: orm.expiresAt,
      consumedAt: orm.consumedAt,
      createdAt: orm.createdAt,
    });
  }

  static toOrm(domain: PasswordResetTokenEntity): PasswordResetTokenOrmEntity {
    const orm = new PasswordResetTokenOrmEntity();

    if (domain.id > 0) {
      orm.id = domain.id;
    }

    orm.uuid = domain.uuid;
    orm.userId = domain.userId;
    orm.tokenHash = domain.tokenHash;
    orm.expiresAt = domain.expiresAt;
    orm.consumedAt = domain.consumedAt;

    return orm;
  }
}
