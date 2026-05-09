import { Inject } from '@nestjs/common';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { UpdateUserRequestDto } from '../dtos/request/update-user.request.dto';
import { UserApplicationService } from '../services/user-application.service';
import { UserEmail } from '../../domain/value-objects/user-email.vo';
import { UserFullName } from '../../domain/value-objects/user-full-name.vo';
import { UserPassword } from '../../domain/value-objects/user-password.vo';

export class UpdateUserUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepo: IUserRepository,

    private readonly userAppService: UserApplicationService,
  ) {}

  async execute(uuid: string, dto: UpdateUserRequestDto) {
    const user = await this.userAppService.findActiveUser(uuid);

    const email = dto.email ? UserEmail.create(dto.email) : undefined;

    if (email) {
      await this.userAppService.ensureEmailAvailable(email, user.email);
    }

    const role = await this.userAppService.resolveRole(
      dto.roleUuid,
      user.roleUuid,
    );

    user.update({
      fullName: dto.fullName ? UserFullName.create(dto.fullName) : undefined,
      email,
      password: dto.password
        ? await UserPassword.create(dto.password)
        : undefined,
      roleUuid: role.uuid,
    });

    await this.userRepo.save(user, role);
  }
}
