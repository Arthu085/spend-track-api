import { RoleMapper } from '@modules/authorization/persistence';
import { UserEntity } from '../../../domain/entities/user.entity';
import { UserOrmEntity } from '../entities/user.orm-entity';

export class UserMapper {
  static toDomain(
    orm: UserOrmEntity,
    actorNames?: ReadonlyMap<number, string>,
  ): UserEntity {
    return UserEntity.reconstitute({
      id: orm.id,
      uuid: orm.uuid,
      status: orm.status,
      name: orm.name,
      email: orm.email,
      password: orm.password,
      emailConfirmedAt: orm.emailConfirmedAt,
      roles: (orm.roles ?? []).map((role) => RoleMapper.toDomain(role)),
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
      createdBy: orm.createdBy,
      updatedBy: orm.updatedBy,
      deletedBy: orm.deletedBy,
      creatorName: orm.createdBy
        ? (actorNames?.get(orm.createdBy) ?? null)
        : null,
      updaterName: orm.updatedBy
        ? (actorNames?.get(orm.updatedBy) ?? null)
        : null,
    });
  }

  static toOrm(domain: UserEntity): UserOrmEntity {
    const orm = new UserOrmEntity();

    if (domain.id > 0) {
      orm.id = domain.id;
      orm.updatedAt = domain.updatedAt;
    }

    orm.uuid = domain.uuid;
    orm.status = domain.status;
    orm.name = domain.name;
    orm.email = domain.email;
    orm.password = domain.password;
    orm.emailConfirmedAt = domain.emailConfirmedAt;
    orm.createdBy = domain.createdBy;
    orm.updatedBy = domain.updatedBy;
    orm.deletedBy = domain.deletedBy;
    orm.roles = domain.roles.map((role) => RoleMapper.toOrm(role));
    orm.deletedAt = domain.deletedAt;

    return orm;
  }
}
