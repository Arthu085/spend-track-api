import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { IRoleRepository } from 'src/modules/access-control/domain/repositories/role.repository.interface';
import { UserEntity } from '../../domain/entities/user.entity';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { AppNotFoundException } from 'src/core/exceptions/app-not-found.exception';
import { UserEmail } from '../../domain/value-objects/user-email.vo';
import { AppConflictException } from 'src/core/exceptions/app-conflict.exception';
import { RoleEntity } from 'src/modules/access-control/domain/entities/role.entity';

@Injectable()
export class UserApplicationService {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepo: IUserRepository,
    @Inject('IRoleRepository')
    private readonly roleRepo: IRoleRepository,
  ) {}

  async findActiveUser(uuid: string): Promise<UserEntity> {
    const user = await this.userRepo.findByUuid(Uuid.from(uuid));

    if (!user) {
      throw new AppNotFoundException({ resource: 'Usuário', gender: 'M' });
    }

    user.ensureIsNotInactive('Usuário', 'M');

    return user;
  }

  async ensureEmailAvailable(
    email: UserEmail,
    currentEmail: UserEmail,
  ): Promise<void> {
    if (email.equals(currentEmail)) {
      return;
    }

    const existingUser = await this.userRepo.findByEmail(email);

    if (existingUser) {
      throw new AppConflictException({ message: 'Email já está em uso' });
    }
  }

  async resolveRole(
    roleUuid?: string,
    currentRoleUuid?: Uuid,
  ): Promise<RoleEntity> {
    const uuid = roleUuid ? Uuid.from(roleUuid) : currentRoleUuid;

    if (!uuid) {
      throw new AppNotFoundException({ resource: 'Função', gender: 'F' });
    }

    const role = await this.roleRepo.findByUuid(uuid);

    if (!role) {
      throw new AppNotFoundException({ resource: 'Função', gender: 'F' });
    }

    return role;
  }
}
