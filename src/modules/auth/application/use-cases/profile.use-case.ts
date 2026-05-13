import { IUserRepository } from 'src/modules/user/domain/repositories/user.repository.interface';
import { ProfileResponseDto } from '../dtos/response/profile.response.dto';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { AppUnauthorizedException } from 'src/core/exceptions/app-unauthorized.exception';
import { IRoleRepository } from 'src/modules/access-control/domain/repositories/role.repository.interface';
import { Inject } from '@nestjs/common';

export class ProfileUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepo: IUserRepository,
    @Inject('IRoleRepository')
    private readonly roleRepo: IRoleRepository,
  ) {}

  async execute(userUuid: string): Promise<ProfileResponseDto> {
    const user = await this.userRepo.findByUuid(Uuid.from(userUuid));

    if (!user) {
      throw new AppUnauthorizedException({
        message: 'Usuário não encontrado',
      });
    }

    const role = await this.roleRepo.findByUuid(user.role.uuid);

    if (!role) {
      throw new AppUnauthorizedException({
        message: 'Role não encontrada',
      });
    }

    return new ProfileResponseDto({
      uuid: user.uuid.toString(),
      roleUuid: user.role.uuid.toString(),
      fullName: user.fullName.getValue(),
      email: user.email.getValue(),
      role: role.name,
    });
  }
}
