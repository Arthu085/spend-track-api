import { Inject } from '@nestjs/common';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { FindOneUserResponseDto } from '../dtos/response/find-one-user.response.dto';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { AppNotFoundException } from 'src/core/exceptions/app-not-found.exception';

export class FindOneUserUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepo: IUserRepository,
  ) {}

  async execute(uuid: string): Promise<FindOneUserResponseDto> {
    const user = await this.userRepo.findByUuid(Uuid.from(uuid));

    if (!user) {
      throw new AppNotFoundException({ resource: 'Usuário', gender: 'M' });
    }

    user.ensureIsNotInactive('Usuário', 'M');

    return new FindOneUserResponseDto(user);
  }
}
