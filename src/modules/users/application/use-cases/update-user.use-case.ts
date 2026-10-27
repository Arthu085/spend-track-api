import { Inject, Injectable } from '@nestjs/common';
import {
  ROLE_REPOSITORY,
  assertRolesResolved,
  type RoleEntity,
  type RoleRepository,
} from '@modules/authorization';
import { assertRecordActive } from '@shared/domain/policies';
import { normalizeEmail } from '@shared/application/filters';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { UserEntity } from '../../domain/entities/user.entity';
import { AdminChangeApprovalRequiredError } from '../../domain/errors/admin-change-approval-required.error';
import { InactiveUserError } from '../../domain/errors/inactive-user.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import {
  assertAdminGrantAllowed,
  assertAdminRoleRetained,
  assertMayManageAdmin,
  hasAdminRole,
  requiresAdminChangeApproval,
} from '../../domain/policies/admin-safety.policy';
import {
  USER_CHANGE_REQUEST_REPOSITORY,
  type UserChangeRequestRepository,
} from '../../domain/repositories/user-change-request.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/repositories/user.repository';
import { UserProfileChangeService } from '../services/user-profile-change.service';

export interface UpdateUserInput {
  uuid: string;
  name?: string;
  email?: string;
  roleUuids?: string[];
  actorId: number | null;
}

@Injectable()
export class UpdateUserUseCase {
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

  async execute(input: UpdateUserInput): Promise<UserEntity> {
    const applied = await this.transactionManager.runInTransaction(async () => {
      await this.userRepository.lockAdminRoster();
      const user = await this.userRepository.findByUuidForUpdate(input.uuid);

      if (!user) {
        throw new UserNotFoundError();
      }

      assertRecordActive(user, new InactiveUserError());

      const actor =
        input.actorId === null
          ? null
          : await this.userRepository.findById(input.actorId);

      assertMayManageAdmin(actor, user);

      const roles =
        input.roleUuids === undefined
          ? user.roles
          : await this.findRoles(input.roleUuids);

      const roleNames = roles.map((role) => role.name);
      assertAdminRoleRetained(user, roleNames);

      if (requiresAdminChangeApproval(input.actorId, user)) {
        throw new AdminChangeApprovalRequiredError();
      }

      const email =
        input.email === undefined ? user.email : normalizeEmail(input.email);

      await this.profileChange.assertEmailAvailable(user, email);
      assertAdminGrantAllowed(actor, user, roleNames);

      if (hasAdminRole(user)) {
        await this.changeRequestRepository.supersedePendingForUser(user.id);
      }

      return this.profileChange.apply(
        user,
        { name: input.name ?? user.name, email, roles },
        input.actorId,
      );
    });

    this.profileChange.warnIfConfirmationUnscheduled(applied);

    return applied.updated;
  }

  private async findRoles(roleUuids: string[]): Promise<RoleEntity[]> {
    const roles = await this.roleRepository.findByUuids(roleUuids);
    assertRolesResolved(roleUuids, roles);

    return roles;
  }
}
