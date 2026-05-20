import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { UpdateUserRequestDto } from '../dtos/request/update-user.request.dto';
import { UserApplicationService } from '../services/user-application.service';
import { UserEmail } from '../../domain/value-objects/user-email.vo';
import { UserFullName } from '../../domain/value-objects/user-full-name.vo';
import { UserPassword } from '../../domain/value-objects/user-password.vo';
import { IPasswordHasher } from 'src/core/domain/services/password-hasher.interface';

@Injectable()
export class UpdateUserUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepo: IUserRepository,
    @Inject('IPasswordHasher')
    private readonly passwordHasher: IPasswordHasher,
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
      user.role.uuid,
    );

    let password: UserPassword | undefined;

    if (dto.password) {
      UserPassword.validatePlain(dto.password);
      const passwordHash = await this.passwordHasher.hash(dto.password);
      password = UserPassword.fromHash(passwordHash);
    }

    user.update({
      fullName: dto.fullName ? UserFullName.create(dto.fullName) : undefined,
      email,
      password,
      role: role,
    });

    await this.userRepo.save(user, {
      roleId: role.id,
    });
  }
}
