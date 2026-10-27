import { AbilityEntity } from '../../../domain/entities/ability.entity';
import { AbilityOrmEntity } from '../entities/ability.orm-entity';

export class AbilityMapper {
  static toDomain(orm: AbilityOrmEntity): AbilityEntity {
    return AbilityEntity.reconstitute({
      id: orm.id,
      uuid: orm.uuid,
      status: orm.status,
      action: orm.action,
      subject: orm.subject,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
    });
  }

  static toOrm(domain: AbilityEntity): AbilityOrmEntity {
    const orm = new AbilityOrmEntity();

    orm.id = domain.id;
    orm.uuid = domain.uuid;
    orm.status = domain.status;
    orm.action = domain.action;
    orm.subject = domain.subject;

    return orm;
  }
}
