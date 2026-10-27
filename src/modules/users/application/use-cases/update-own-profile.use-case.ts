import { Inject, Injectable, Logger } from '@nestjs/common';
import { assertRecordActive } from '@shared/domain/policies';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import { normalizeEmail } from '@shared/application/filters';
import {
  EMAIL_OUTBOX_PORT,
  EmailSchedulingUnavailableError,
  TRANSACTION_MANAGER,
  type EmailOutboxPort,
  type ScheduleEmailResult,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { UserEntity } from '../../domain/entities/user.entity';
import { CurrentPasswordRequiredError } from '../../domain/errors/current-password-required.error';
import { InactiveUserError } from '../../domain/errors/inactive-user.error';
import { InvalidCurrentPasswordError } from '../../domain/errors/invalid-current-password.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { hasAdminRole } from '../../domain/policies/admin-safety.policy';
import {
  USER_CHANGE_REQUEST_REPOSITORY,
  type UserChangeRequestRepository,
} from '../../domain/repositories/user-change-request.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/repositories/user.repository';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../ports/password-hasher.port';
import { UserProfileChangeService } from '../services/user-profile-change.service';

export interface UpdateOwnProfileInput {
  actorId: number;
  name?: string;
  email?: string;
  currentPassword?: string;
}

@Injectable()
export class UpdateOwnProfileUseCase {
  private readonly logger = new Logger(UpdateOwnProfileUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(USER_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRequestRepository: UserChangeRequestRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(EMAIL_OUTBOX_PORT)
    private readonly emailOutbox: EmailOutboxPort,
    private readonly profileChange: UserProfileChangeService,
  ) {}

  async execute(input: UpdateOwnProfileInput): Promise<UserEntity> {
    const { applied, notice } = await this.transactionManager.runInTransaction(
      async () => {
        const user = await this.userRepository.findByIdForUpdate(input.actorId);

        if (!user) {
          throw new UserNotFoundError();
        }

        assertRecordActive(user, new InactiveUserError());

        const email =
          input.email === undefined ? user.email : normalizeEmail(input.email);

        const emailChanged = email !== user.email;

        if (emailChanged) {
          await this.assertCurrentPassword(user, input.currentPassword);
        }

        await this.profileChange.assertEmailAvailable(user, email);

        if (hasAdminRole(user)) {
          await this.changeRequestRepository.supersedePendingForUser(user.id);
        }

        const applied = await this.profileChange.apply(
          user,
          { name: input.name ?? user.name, email, roles: user.roles },
          user.id,
        );

        const notice = emailChanged
          ? await this.scheduleEmailChangeNotice(user.email)
          : null;

        return { applied, notice };
      },
    );

    this.profileChange.warnIfConfirmationUnscheduled(applied);
    this.warnIfNoticeUnscheduled(applied.updated, notice);

    return applied.updated;
  }

  private async assertCurrentPassword(
    user: UserEntity,
    currentPassword: string | undefined,
  ): Promise<void> {
    if (currentPassword === undefined) {
      throw new CurrentPasswordRequiredError();
    }

    const matches = await this.passwordHasher.verify(
      user.password,
      currentPassword,
    );

    if (!matches) {
      throw new InvalidCurrentPasswordError();
    }
  }

  private async scheduleEmailChangeNotice(
    previousEmail: string,
  ): Promise<ScheduleEmailResult> {
    const notice = await this.emailOutbox.schedule({
      emailType: EmailType.EMAIL_CHANGE_NOTICE,
      recipient: previousEmail,
    });

    if (!notice.scheduled && notice.reason === 'UNAVAILABLE') {
      throw new EmailSchedulingUnavailableError();
    }

    return notice;
  }

  private warnIfNoticeUnscheduled(
    updated: UserEntity,
    notice: ScheduleEmailResult | null,
  ): void {
    if (notice && !notice.scheduled) {
      this.logger.warn({
        msg: 'Email change notice not scheduled',
        userId: updated.uuid,
        reason: notice.reason,
      });
    }
  }
}
