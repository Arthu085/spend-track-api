import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { UserEntity } from '../../domain/entities/user.entity';
import { UserOrmEntity } from '../entities/user.orm.entity';
import { UserFullName } from '../../domain/value-objects/user-full-name.vo';
import { UserEmail } from '../../domain/value-objects/user-email.vo';
import { UserPassword } from '../../domain/value-objects/user-password.vo';
import { UserSaveRelations } from '../../domain/types/user-save-relations.type';
import { RoleMapper } from 'src/modules/access-control/infra/mappers/role.mapper';

export class UserMapper {
  static toDomain(orm: UserOrmEntity): UserEntity {
    if (!orm.role) {
      throw new Error('Função não carregada');
    }

    return UserEntity.rehydrate({
      id: orm.id,
      uuid: Uuid.from(orm.uuid),
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
      status: orm.status,
      fullName: UserFullName.reconstitute(orm.fullName),
      email: UserEmail.reconstitute(orm.email),
      password: UserPassword.fromHash(orm.password),
      role: RoleMapper.toDomain(orm.role),
      hashedRefreshToken: orm.hashedRefreshToken,
    });
  }

  static toOrm(
    domain: UserEntity,
    relations?: UserSaveRelations,
  ): UserOrmEntity {
    const orm = new UserOrmEntity();

    if (domain.id !== undefined && domain.id > 0) {
      orm.id = domain.id;
    }

    if (relations) {
      orm.roleId = relations.roleId;
    }

    orm.uuid = domain.uuid.toString();
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt;
    orm.deletedAt = domain.deletedAt ?? null;
    orm.status = domain.status;
    orm.fullName = domain.fullName.getValue();
    orm.email = domain.email.getValue();
    orm.password = domain.password.getValue();
    orm.hashedRefreshToken = domain.hashedRefreshToken ?? null;

    return orm;
  }
}
