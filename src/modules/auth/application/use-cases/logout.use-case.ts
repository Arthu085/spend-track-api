import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repository.interface';
import { AuthUser } from '../../domain/types/auth-user.type';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepo: IUserRepository,
  ) {}

  async execute(authUser: AuthUser): Promise<void> {
    const user = await this.userRepo.findByUuid(Uuid.from(authUser.uuid));

    if (user) {
      user.updateHashedRefreshToken(null);

      await this.userRepo.save(user);
    }
  }
}
