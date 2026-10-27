import { RoleEntity } from '../../../domain/entities/role.entity';
import { RoleOrmEntity } from '../entities/role.orm-entity';
import { AbilityMapper } from './ability.mapper';

export class RoleMapper {
  static toDomain(orm: RoleOrmEntity): RoleEntity {
    return RoleEntity.reconstitute({
      id: orm.id,
      uuid: orm.uuid,
      status: orm.status,
      name: orm.name,
      abilities: (orm.abilities ?? []).map((ability) =>
        AbilityMapper.toDomain(ability),
      ),
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
    });
  }

  static toOrm(domain: RoleEntity): RoleOrmEntity {
    const orm = new RoleOrmEntity();

    orm.id = domain.id;
    orm.uuid = domain.uuid;
    orm.status = domain.status;
    orm.name = domain.name;
    orm.abilities = domain.abilities.map((ability) =>
      AbilityMapper.toOrm(ability),
    );

    return orm;
  }
}
