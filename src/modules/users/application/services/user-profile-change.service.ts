import { Inject, Injectable, Logger } from '@nestjs/common';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import {
  EMAIL_OUTBOX_PORT,
  EmailSchedulingUnavailableError,
  type EmailOutboxPort,
  type ScheduleEmailResult,
} from '@shared/application/ports';
import { UserEntity } from '../../domain/entities/user.entity';
import type { UserProfileValues } from '../../domain/entities/user-change-request.entity';
import { EmailAlreadyInUseError } from '../../domain/errors/email-already-in-use.error';
import {
  EMAIL_CONFIRMATION_TOKEN_REPOSITORY,
  type EmailConfirmationTokenRepository,
} from '../../domain/repositories/email-confirmation-token.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/repositories/user.repository';
import {
  EMAIL_CHANGE_TOKEN_REVOKERS,
  type EmailChangeTokenRevokerRegistry,
} from '../ports/email-change-token-revoker.port';
import {
  USER_SESSION_REVOKERS,
  type UserSessionRevokerRegistry,
} from '../ports/user-session-revoker.port';

export interface AppliedProfileChange {
  updated: UserEntity;
  confirmation: ScheduleEmailResult | null;
}

@Injectable()
export class UserProfileChangeService {
  private readonly logger = new Logger(UserProfileChangeService.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(EMAIL_OUTBOX_PORT)
    private readonly emailOutbox: EmailOutboxPort,
    @Inject(EMAIL_CONFIRMATION_TOKEN_REPOSITORY)
    private readonly emailConfirmationTokenRepository: EmailConfirmationTokenRepository,
    @Inject(EMAIL_CHANGE_TOKEN_REVOKERS)
    private readonly emailChangeTokenRevokers: EmailChangeTokenRevokerRegistry,
    @Inject(USER_SESSION_REVOKERS)
    private readonly userSessionRevokers: UserSessionRevokerRegistry,
  ) {}

  async assertEmailAvailable(user: UserEntity, email: string): Promise<void> {
    if (email === user.email) {
      return;
    }

    const existing = await this.userRepository.findByEmail(email);

    if (existing) {
      throw new EmailAlreadyInUseError();
    }
  }

  async apply(
    user: UserEntity,
    values: UserProfileValues,
    actorId: number | null,
  ): Promise<AppliedProfileChange> {
    const emailChanged = values.email !== user.email;

    const updated = await this.userRepository.update(
      user.withProfile({
        name: values.name,
        email: values.email,
        roles: values.roles,
        actorId,
      }),
    );

    if (actorId === user.id) {
      await this.userSessionRevokers.revokeAllForUser(user.id);
    }

    if (!emailChanged) {
      return { updated, confirmation: null };
    }

    await this.emailConfirmationTokenRepository.consumeAllForUser(user.id);
    await this.emailChangeTokenRevokers.revokeAllForUser(user.id);

    const confirmation = await this.emailOutbox.schedule({
      emailType: EmailType.EMAIL_CONFIRMATION,
      recipient: updated.email,
    });

    if (!confirmation.scheduled && confirmation.reason === 'UNAVAILABLE') {
      throw new EmailSchedulingUnavailableError();
    }

    return { updated, confirmation };
  }

  warnIfConfirmationUnscheduled({
    updated,
    confirmation,
  }: AppliedProfileChange): void {
    if (confirmation && !confirmation.scheduled) {
      this.logger.warn({
        msg: 'Email confirmation not scheduled',
        userId: updated.uuid,
        reason: confirmation.reason,
      });
    }
  }
}
