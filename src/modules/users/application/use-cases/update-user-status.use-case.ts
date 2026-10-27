import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { UserEntity } from '../../domain/entities/user.entity';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import {
  assertActiveAdminRemains,
  assertMayManageAdmin,
  hasAdminRole,
  assertMayDeactivateSelf,
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

export interface UpdateUserStatusInput {
  uuid: string;
  status: RecordStatus;
  actorId: number | null;
}

@Injectable()
export class UpdateUserStatusUseCase {
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

  async execute(input: UpdateUserStatusInput): Promise<UserEntity> {
    return this.transactionManager.runInTransaction(async () => {
      await this.userRepository.lockAdminRoster();
      const user = await this.userRepository.findByUuidForUpdate(input.uuid);

      if (!user) {
        throw new UserNotFoundError();
      }

      assertMayDeactivateSelf(user, input.actorId, input.status);

      const actor =
        input.actorId === null
          ? null
          : await this.userRepository.findById(input.actorId);

      assertMayManageAdmin(actor, user);

      if (hasActiveAdminRole(user) && input.status === RecordStatus.INACTIVE) {
        assertActiveAdminRemains(
          true,
          await this.userRepository.countActiveAdmins(),
        );
      }

      if (hasAdminRole(user) && input.status === RecordStatus.INACTIVE) {
        await this.changeRequestRepository.supersedePendingInvolving(user.id);
      }

      const updatedUser = await this.userRepository.update(
        user.withStatus(input.status, input.actorId),
      );

      if (input.status === RecordStatus.INACTIVE) {
        await this.userSessionRevokers.revokeAllForUser(user.id);
      }

      return updatedUser;
    });
  }
}
