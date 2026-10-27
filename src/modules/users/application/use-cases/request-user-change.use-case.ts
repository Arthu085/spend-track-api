import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '@core/config';
import {
  ROLE_REPOSITORY,
  assertRolesResolved,
  type RoleEntity,
  type RoleRepository,
} from '@modules/authorization';
import { assertRecordActive } from '@shared/domain/policies';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import { normalizeEmail } from '@shared/application/filters';
import {
  EMAIL_OUTBOX_PORT,
  EmailSchedulingUnavailableError,
  TRANSACTION_MANAGER,
  type EmailOutboxPort,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { HOUR_IN_MS } from '@shared/application/time';
import { UserChangeRequestEntity } from '../../domain/entities/user-change-request.entity';
import { InactiveUserError } from '../../domain/errors/inactive-user.error';
import { UserChangeRequestNotApplicableError } from '../../domain/errors/user-change-request-not-applicable.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import {
  assertAdminRoleRetained,
  assertMayManageAdmin,
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

export interface RequestUserChangeInput {
  uuid: string;
  name?: string;
  email?: string;
  roleUuids?: string[];
  actorId: number;
}

@Injectable()
export class RequestUserChangeUseCase {
  private readonly logger = new Logger(RequestUserChangeUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(ROLE_REPOSITORY)
    private readonly roleRepository: RoleRepository,
    @Inject(USER_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRequestRepository: UserChangeRequestRepository,
    @Inject(EMAIL_OUTBOX_PORT)
    private readonly emailOutbox: EmailOutboxPort,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly profileChange: UserProfileChangeService,
    private readonly config: AppConfigService,
  ) {}

  async execute(
    input: RequestUserChangeInput,
  ): Promise<UserChangeRequestEntity> {
    const { request, notification } =
      await this.transactionManager.runInTransaction(async () => {
        await this.userRepository.lockAdminRoster();
        const user = await this.userRepository.findByUuidForUpdate(input.uuid);

        if (!user) {
          throw new UserNotFoundError();
        }

        assertRecordActive(user, new InactiveUserError());

        const actor = await this.userRepository.findById(input.actorId);
        assertMayManageAdmin(actor, user);

        if (!requiresAdminChangeApproval(input.actorId, user)) {
          throw new UserChangeRequestNotApplicableError();
        }

        const email =
          input.email === undefined ? user.email : normalizeEmail(input.email);

        await this.profileChange.assertEmailAvailable(user, email);

        const roles =
          input.roleUuids === undefined
            ? user.roles
            : await this.findRoles(input.roleUuids);

        assertAdminRoleRetained(
          user,
          roles.map((role) => role.name),
        );

        await this.changeRequestRepository.supersedePendingForUser(user.id);

        const ttlMs =
          this.config.verificationTokens.userChangeRequestTtlHours * HOUR_IN_MS;

        const request = await this.changeRequestRepository.create(
          UserChangeRequestEntity.open({
            uuid: randomUUID(),
            targetUserId: user.id,
            requestedBy: input.actorId,
            current: { name: user.name, email: user.email, roles: user.roles },
            requested: { name: input.name ?? user.name, email, roles },
            expiresAt: new Date(Date.now() + ttlMs),
          }),
        );

        const notification = await this.emailOutbox.schedule({
          emailType: EmailType.USER_CHANGE_REQUEST,
          recipient: user.email,
        });

        if (!notification.scheduled && notification.reason === 'UNAVAILABLE') {
          throw new EmailSchedulingUnavailableError();
        }

        return { request, notification };
      });

    if (!notification.scheduled) {
      this.logger.warn({
        msg: 'Change request notification not scheduled',
        changeRequestId: request.uuid,
        reason: notification.reason,
      });
    }

    return request;
  }

  private async findRoles(roleUuids: string[]): Promise<RoleEntity[]> {
    const roles = await this.roleRepository.findByUuids(roleUuids);
    assertRolesResolved(roleUuids, roles);

    return roles;
  }
}
