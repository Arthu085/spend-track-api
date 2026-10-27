import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import {
  assertActiveAdminRemains,
  assertMayManageAdmin,
  hasAdminRole,
  assertMayDeleteSelf,
  hasActiveAdminRole,
} from '../../domain/policies/admin-safety.policy';
import {
  USER_CHANGE_REQUEST_REPOSITORY,
  type UserChangeRequestRepository,
} from '../../domain/repositories/user-change-request.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/repositories/user.repository';
import {
  USER_SESSION_REVOKERS,
  type UserSessionRevokerRegistry,
} from '../ports/user-session-revoker.port';

export interface DeleteUserInput {
  uuid: string;
  actorId: number | null;
}

@Injectable()
export class DeleteUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(USER_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRequestRepository: UserChangeRequestRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    @Inject(USER_SESSION_REVOKERS)
    private readonly userSessionRevokers: UserSessionRevokerRegistry,
  ) {}

  async execute(input: DeleteUserInput): Promise<void> {
    await this.transactionManager.runInTransaction(async () => {
      await this.userRepository.lockAdminRoster();
      const user = await this.userRepository.findByUuidForUpdate(input.uuid);

      if (!user) {
        throw new UserNotFoundError();
      }

      assertMayDeleteSelf(user, input.actorId);

      const actor =
        input.actorId === null
          ? null
          : await this.userRepository.findById(input.actorId);

      assertMayManageAdmin(actor, user);

      if (hasActiveAdminRole(user)) {
        assertActiveAdminRemains(
          true,
          await this.userRepository.countActiveAdmins(),
        );
      }

      if (hasAdminRole(user)) {
        await this.changeRequestRepository.supersedePendingInvolving(user.id);
      }

      const deletedUser = user.markDeleted(input.actorId);

      await this.userRepository.softDelete(deletedUser);
      await this.userSessionRevokers.revokeAllForUser(user.id);
    });
  }
}
