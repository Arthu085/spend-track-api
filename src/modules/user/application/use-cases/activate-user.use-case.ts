import { Inject } from '@nestjs/common';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { AppNotFoundException } from 'src/core/exceptions/app-not-found.exception';

export class ActivateUserUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepo: IUserRepository,
  ) {}

  async execute(uuid: string): Promise<void> {
    const user = await this.userRepo.findByUuid(Uuid.from(uuid));

    if (!user) {
      throw new AppNotFoundException({
        resource: 'Usuário',
        gender: 'M',
      });
    }

    user.activate('Usuário', 'M');

    await this.userRepo.save(user);
  }
}
