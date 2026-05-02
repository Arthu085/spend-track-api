import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { CreateUserRequestDto } from '../dtos/request/create-user.request.dto';
import { UserFullName } from '../../domain/value-objects/user-full-name.vo';
import { UserEmail } from '../../domain/value-objects/user-email.vo';
import { UserPassword } from '../../domain/value-objects/user-password.vo';
import { AppConflictException } from 'src/core/exceptions/app-conflict.exception';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { UserEntity } from '../../domain/entities/user.entity';
import { IRoleRepository } from 'src/modules/access-control/domain/repositories/role.repository.interface';
import { AppNotFoundException } from 'src/core/exceptions/app-not-found.exception';

@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepo: IUserRepository,
    @Inject('IRoleRepository')
    private readonly roleRepo: IRoleRepository,
  ) {}

  async execute(dto: CreateUserRequestDto): Promise<void> {
    const params = {
      fullName: UserFullName.create(dto.fullName),
      email: UserEmail.create(dto.email),
      password: await UserPassword.create(dto.password),
      roleUuid: Uuid.from(dto.roleUuid),
    };

    const existingUser = await this.userRepo.findByEmail(params.email);

    if (existingUser) {
      throw new AppConflictException({ message: 'Email já está em uso' });
    }

    const role = await this.roleRepo.findByUuid(params.roleUuid);

    if (!role) {
      throw new AppNotFoundException({ resource: 'Função', gender: 'F' });
    }

    const user = UserEntity.create({
      ...params,
    });

    await this.userRepo.save(user, role);
  }
}
