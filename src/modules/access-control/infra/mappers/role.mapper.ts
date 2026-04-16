import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { RoleEntity } from '../../domain/entities/role.entity';
import { RoleOrmEntity } from '../entities/role.orm.entity';
import { AbilityMapper } from './ability.mapper';

export class RoleMapper {
  static toDomain(orm: RoleOrmEntity): RoleEntity {
    const abilities =
      orm.roleAbilities?.map((ra) => AbilityMapper.toDomain(ra.ability)) ?? [];

    return RoleEntity.rehydrate({
      id: orm.id,
      uuid: Uuid.from(orm.uuid),
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
      status: orm.status,
      name: orm.name,
      abilities,
    });
  }

  static toOrm(domain: RoleEntity): RoleOrmEntity {
    const orm = new RoleOrmEntity();

    if (domain.id !== undefined) {
      orm.id = domain.id;
    }

    orm.uuid = domain.uuid.toString();
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt;
    orm.deletedAt = domain.deletedAt ?? null;
    orm.status = domain.status;
    orm.name = domain.name;

    return orm;
  }
}
