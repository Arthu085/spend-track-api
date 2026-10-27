import { Inject, Injectable } from '@nestjs/common';
import {
  ROLE_REPOSITORY,
  assertRolesResolved,
  type RoleRepository,
} from '@modules/authorization';
import { assertRecordActive } from '@shared/domain/policies';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { UserEntity } from '../../domain/entities/user.entity';
import { InactiveUserError } from '../../domain/errors/inactive-user.error';
import { UserChangeRequestStaleError } from '../../domain/errors/user-change-request-stale.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { assertAdminRoleRetained } from '../../domain/policies/admin-safety.policy';
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
import { UserProfileChangeService } from '../services/user-profile-change.service';

export interface DecideUserChangeRequestInput {
  uuid: string;
  actorId: number;
}

@Injectable()
export class ApproveUserChangeRequestUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(ROLE_REPOSITORY)
    private readonly roleRepository: RoleRepository,
    @Inject(USER_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRequestRepository: UserChangeRequestRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly profileChange: UserProfileChangeService,
  ) {}

  async execute(input: DecideUserChangeRequestInput): Promise<UserEntity> {
    const applied = await this.transactionManager.runInTransaction(async () => {
      const user = await this.userRepository.findByIdForUpdate(input.actorId);

      if (!user) {
        throw new UserNotFoundError();
      }

      assertRecordActive(user, new InactiveUserError());
      assertMayReceiveChangeRequests(user);

      const request = await this.changeRequestRepository.findByUuid(input.uuid);

      assertChangeRequestPendingFor(request, user.id, new Date());

      if (!request.matchesCurrentProfileOf(user)) {
        throw new UserChangeRequestStaleError();
      }

      const { requested } = request;

      await this.profileChange.assertEmailAvailable(user, requested.email);

      const roleUuids = requested.roles.map((role) => role.uuid);
      const roles = await this.roleRepository.findByUuids(roleUuids);
      assertRolesResolved(roleUuids, roles);
      assertAdminRoleRetained(
        user,
        roles.map((role) => role.name),
      );

      await this.changeRequestRepository.saveDecision(request.approve());

      return this.profileChange.apply(
        user,
        { name: requested.name, email: requested.email, roles },
        user.id,
      );
    });

    this.profileChange.warnIfConfirmationUnscheduled(applied);

    return applied.updated;
  }
}
