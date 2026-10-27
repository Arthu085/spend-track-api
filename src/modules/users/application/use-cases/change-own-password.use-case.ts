import { Inject, Injectable } from '@nestjs/common';
import { assertRecordActive } from '@shared/domain/policies';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { InactiveUserError } from '../../domain/errors/inactive-user.error';
import { InvalidCurrentPasswordError } from '../../domain/errors/invalid-current-password.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/repositories/user.repository';
import {
  PASSWORD_CHANGE_TOKEN_REVOKERS,
  type PasswordChangeTokenRevokerRegistry,
} from '../ports/password-change-token-revoker.port';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../ports/password-hasher.port';
import {
  USER_SESSION_REVOKERS,
  type UserSessionRevokerRegistry,
} from '../ports/user-session-revoker.port';

export interface ChangeOwnPasswordInput {
  actorId: number;
  currentPassword: string;
  newPassword: string;
}

@Injectable()
export class ChangeOwnPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(PASSWORD_CHANGE_TOKEN_REVOKERS)
    private readonly passwordChangeTokenRevokers: PasswordChangeTokenRevokerRegistry,
    @Inject(USER_SESSION_REVOKERS)
    private readonly sessionRevokers: UserSessionRevokerRegistry,
  ) {}

  async execute(input: ChangeOwnPasswordInput): Promise<void> {
    const hashedPassword = await this.passwordHasher.hash(input.newPassword);

    await this.transactionManager.runInTransaction(async () => {
      const user = await this.userRepository.findByIdForUpdate(input.actorId);

      if (!user) {
        throw new UserNotFoundError();
      }

      assertRecordActive(user, new InactiveUserError());

      const matches = await this.passwordHasher.verify(
        user.password,
        input.currentPassword,
      );

      if (!matches) {
        throw new InvalidCurrentPasswordError();
      }

      await this.userRepository.update(
        user.withPassword(hashedPassword, user.id),
      );

      await this.passwordChangeTokenRevokers.revokeAllForUser(user.id);
      await this.sessionRevokers.revokeAllForUser(user.id);
    });
  }
}
