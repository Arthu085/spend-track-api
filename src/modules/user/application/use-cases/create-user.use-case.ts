import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { CreateUserRequestDto } from '../dtos/request/create-user.request.dto';
import { UserFullName } from '../../domain/value-objects/user-full-name.vo';
import { UserEmail } from '../../domain/value-objects/user-email.vo';
import { UserPassword } from '../../domain/value-objects/user-password.vo';
import { UserEntity } from '../../domain/entities/user.entity';
import { UserApplicationService } from '../services/user-application.service';

@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepo: IUserRepository,
    private readonly userAppService: UserApplicationService,
  ) {}

  async execute(dto: CreateUserRequestDto): Promise<void> {
    const email = UserEmail.create(dto.email);

    await this.userAppService.ensureEmailAvailable(email);

    const role = await this.userAppService.resolveRole(dto.roleUuid);

    const user = UserEntity.create({
      fullName: UserFullName.create(dto.fullName),
      email,
      password: await UserPassword.create(dto.password),
      role: role,
    });

    await this.userRepo.save(user, {
      roleId: role.id,
    });
  }
}
