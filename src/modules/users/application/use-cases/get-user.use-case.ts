import { Inject, Injectable } from '@nestjs/common';
import { assertRecordActive } from '@shared/domain/policies';
import { UserEntity } from '../../domain/entities/user.entity';
import { InactiveUserError } from '../../domain/errors/inactive-user.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/repositories/user.repository';

@Injectable()
export class GetUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(uuid: string): Promise<UserEntity> {
    const user = await this.userRepository.findByUuid(uuid);

    if (!user) {
      throw new UserNotFoundError();
    }

    assertRecordActive(user, new InactiveUserError());

    return user;
  }
}
