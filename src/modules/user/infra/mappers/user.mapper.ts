import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { UserEntity } from '../../domain/entities/user.entity';
import { UserOrmEntity } from '../entities/user.orm.entity';
import { UserFullName } from '../../domain/value-objects/user-full-name.vo';
import { UserEmail } from '../../domain/value-objects/user-email.vo';
import { UserPassword } from '../../domain/value-objects/user-password.vo';
import { RoleEntity } from 'src/modules/access-control/domain/entities/role.entity';
import { RoleMapper } from 'src/modules/access-control/infra/mappers/role.mapper';
import { AppBadRequestException } from 'src/core/exceptions/app-bad-request.exception';

export class UserMapper {
  static toDomain(orm: UserOrmEntity): UserEntity {
    if (!orm.role) {
      throw new AppBadRequestException({
        message: 'Função não carregada',
      });
    }

    return UserEntity.rehydrate({
      id: orm.id,
      uuid: Uuid.from(orm.uuid),
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
      status: orm.status,
      fullName: UserFullName.create(orm.fullName),
      email: UserEmail.create(orm.email),
      password: UserPassword.fromHash(orm.password),
      roleUuid: Uuid.from(orm.role?.uuid),
    });
  }

  static toOrm(domain: UserEntity, role: RoleEntity): UserOrmEntity {
    const orm = new UserOrmEntity();

    if (domain.id !== undefined) {
      orm.id = domain.id;
    }

    orm.uuid = domain.uuid.toString();
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt;
    orm.deletedAt = domain.deletedAt ?? null;
    orm.status = domain.status;
    orm.fullName = domain.fullName.getValue();
    orm.email = domain.email.getValue();
    orm.password = domain.password.getValue();
    orm.role = RoleMapper.toOrm(role);

    return orm;
  }
}
