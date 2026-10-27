import { RoleMapper } from '@modules/authorization/persistence';
import { UserChangeRequestEntity } from '../../../domain/entities/user-change-request.entity';
import { UserChangeRequestOrmEntity } from '../entities/user-change-request.orm-entity';

export class UserChangeRequestMapper {
  static toDomain(orm: UserChangeRequestOrmEntity): UserChangeRequestEntity {
    return UserChangeRequestEntity.reconstitute({
      id: orm.id,
      uuid: orm.uuid,
      createdAt: orm.createdAt,
      targetUserId: orm.targetUserId,
      requestedBy: orm.requestedBy,
      requesterName: orm.requester?.name ?? null,
      status: orm.status,
      current: {
        name: orm.currentName,
        email: orm.currentEmail,
        roles: (orm.currentRoles ?? []).map((role) =>
          RoleMapper.toDomain(role),
        ),
      },
      requested: {
        name: orm.requestedName,
        email: orm.requestedEmail,
        roles: (orm.requestedRoles ?? []).map((role) =>
          RoleMapper.toDomain(role),
        ),
      },
      expiresAt: orm.expiresAt,
      decidedAt: orm.decidedAt,
    });
  }

  static toOrm(domain: UserChangeRequestEntity): UserChangeRequestOrmEntity {
    const orm = new UserChangeRequestOrmEntity();

    if (domain.id > 0) {
      orm.id = domain.id;
    }

    orm.uuid = domain.uuid;
    orm.targetUserId = domain.targetUserId;
    orm.requestedBy = domain.requestedBy;
    orm.status = domain.status;
    orm.currentName = domain.current.name;
    orm.currentEmail = domain.current.email;
    orm.currentRoles = domain.current.roles.map((role) =>
      RoleMapper.toOrm(role),
    );
    orm.requestedName = domain.requested.name;
    orm.requestedEmail = domain.requested.email;
    orm.requestedRoles = domain.requested.roles.map((role) =>
      RoleMapper.toOrm(role),
    );
    orm.expiresAt = domain.expiresAt;
    orm.decidedAt = domain.decidedAt;

    return orm;
  }
}
