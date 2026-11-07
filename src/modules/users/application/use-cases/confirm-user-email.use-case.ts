import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { normalizeEmail } from '@shared/application/filters';
import { assertRecordActive } from '@shared/domain/policies';
import { UserEntity } from '../../domain/entities/user.entity';
import { InactiveUserError } from '../../domain/errors/inactive-user.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { EmailConfirmationStaleError } from '../../domain/errors/email-confirmation-stale.error';
import { assertMayManageAdmin } from '../../domain/policies/admin-safety.policy';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/repositories/user.repository';
import {
  EMAIL_CONFIRMATION_TOKEN_REPOSITORY,
  type EmailConfirmationTokenRepository,
} from '../../domain/repositories/email-confirmation-token.repository';

export interface ConfirmUserEmailInput {
  uuid: string;
  email: string;
  actorId: number;
}

@Injectable()
export class ConfirmUserEmailUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(EMAIL_CONFIRMATION_TOKEN_REPOSITORY)
    private readonly tokenRepository: EmailConfirmationTokenRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async execute(input: ConfirmUserEmailInput): Promise<UserEntity> {
    return this.transactionManager.runInTransaction(async () => {
      await this.userRepository.lockAdminRoster();
      const user = await this.userRepository.findByUuidForUpdate(input.uuid);

      if (!user) {
        throw new UserNotFoundError();
      }

      assertRecordActive(user, new InactiveUserError());
      const actor = await this.userRepository.findById(input.actorId);

      assertMayManageAdmin(actor, user);

      if (user.email !== normalizeEmail(input.email)) {
        throw new EmailConfirmationStaleError();
      }

      await this.tokenRepository.consumeAllForUser(user.id);

      if (user.emailConfirmedAt !== null) {
        return user;
      }

      return this.userRepository.update(
        user.withEmailConfirmed(new Date(), input.actorId),
      );
    });
  }
}
