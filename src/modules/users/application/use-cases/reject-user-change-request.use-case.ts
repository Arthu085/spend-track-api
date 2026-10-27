import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import {
  assertChangeRequestPendingFor,
  assertMayReceiveChangeRequests,
} from '../../domain/policies/user-change-request.policy';
import {
  USER_CHANGE_REQUEST_REPOSITORY,
  type UserChangeRequestRepository,
} from '../../domain/repositories/user-change-request.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/repositories/user.repository';
import type { DecideUserChangeRequestInput } from './approve-user-change-request.use-case';

@Injectable()
export class RejectUserChangeRequestUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(USER_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRequestRepository: UserChangeRequestRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async execute(input: DecideUserChangeRequestInput): Promise<void> {
    await this.transactionManager.runInTransaction(async () => {
      const user = await this.userRepository.findByIdForUpdate(input.actorId);

      if (!user) {
        throw new UserNotFoundError();
      }

      assertMayReceiveChangeRequests(user);

      const request = await this.changeRequestRepository.findByUuid(input.uuid);

      assertChangeRequestPendingFor(request, user.id, new Date());

      await this.changeRequestRepository.saveDecision(request.reject());
    });
  }
}
