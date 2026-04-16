import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { RoleAbilityEntity } from '../../domain/entities/role-ability.entity';
import { RoleAbilityOrmEntity } from '../entities/role-ability.orm.entity';
import { RoleMapper } from './role.mapper';
import { AbilityMapper } from './ability.mapper';

export class RoleAbilityMapper {
  static toDoamin(orm: RoleAbilityOrmEntity): RoleAbilityEntity {
    return RoleAbilityEntity.rehydrate({
      id: orm.id,
      uuid: Uuid.from(orm.uuid),
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
      status: orm.status,
      role: RoleMapper.toDomain(orm.role),
      ability: AbilityMapper.toDomain(orm.ability),
    });
  }

  static toOrm(domain: RoleAbilityEntity): RoleAbilityOrmEntity {
    const orm = new RoleAbilityOrmEntity();

    if (domain.id !== undefined) {
      orm.id = domain.id;
    }

    orm.uuid = domain.uuid.toString();
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt;
    orm.deletedAt = domain.deletedAt ?? null;
    orm.status = domain.status;
    orm.role = RoleMapper.toOrm(domain.role);
    orm.ability = AbilityMapper.toOrm(domain.ability);

    return orm;
  }
}
