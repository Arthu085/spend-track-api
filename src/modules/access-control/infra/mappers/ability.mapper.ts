import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { AbilityEntity } from '../../domain/entities/ability.entity';
import { AbilityOrmEntity } from '../entities/ability.orm.entity';

export class AbilityMapper {
  static toDomain(orm: AbilityOrmEntity): AbilityEntity {
    return AbilityEntity.rehydrate({
      id: orm.id,
      uuid: Uuid.from(orm.uuid),
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
      status: orm.status,
      action: orm.action,
      subject: orm.subject,
    });
  }
}
