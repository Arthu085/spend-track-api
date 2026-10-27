import { Inject, Injectable } from '@nestjs/common';
import { UserChangeRequestEntity } from '../../domain/entities/user-change-request.entity';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { assertMayReceiveChangeRequests } from '../../domain/policies/user-change-request.policy';
import {
  USER_CHANGE_REQUEST_REPOSITORY,
  type UserChangeRequestRepository,
} from '../../domain/repositories/user-change-request.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/repositories/user.repository';

@Injectable()
export class ListMyUserChangeRequestsUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(USER_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRequestRepository: UserChangeRequestRepository,
  ) {}

  async execute(actorId: number): Promise<UserChangeRequestEntity[]> {
    const user = await this.userRepository.findById(actorId);

    if (!user) {
      throw new UserNotFoundError();
    }

    assertMayReceiveChangeRequests(user);

    return this.changeRequestRepository.findPendingForUser(actorId, new Date());
  }
}
