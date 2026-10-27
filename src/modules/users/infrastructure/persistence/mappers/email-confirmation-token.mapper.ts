import { EmailConfirmationTokenEntity } from '../../../domain/entities/email-confirmation-token.entity';
import { EmailConfirmationTokenOrmEntity } from '../entities/email-confirmation-token.orm-entity';

export class EmailConfirmationTokenMapper {
  static toDomain(
    orm: EmailConfirmationTokenOrmEntity,
  ): EmailConfirmationTokenEntity {
    return EmailConfirmationTokenEntity.reconstitute({
      id: orm.id,
      uuid: orm.uuid,
      userId: orm.userId,
      tokenHash: orm.tokenHash,
      expiresAt: orm.expiresAt,
      consumedAt: orm.consumedAt,
      createdAt: orm.createdAt,
    });
  }

  static toOrm(
    domain: EmailConfirmationTokenEntity,
  ): EmailConfirmationTokenOrmEntity {
    const orm = new EmailConfirmationTokenOrmEntity();

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
