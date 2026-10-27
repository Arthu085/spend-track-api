import { Inject, Injectable } from '@nestjs/common';
import {
  TOKEN_HASHER,
  type TokenHasher,
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { OneTimeToken } from '@shared/application/tokens';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
  USER_REPOSITORY,
  type UserRepository,
} from '@modules/users';
import { InvalidPasswordResetTokenError } from '../../domain/errors/invalid-password-reset-token.error';
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  type PasswordResetTokenRepository,
} from '../../domain/repositories/password-reset-token.repository';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '../../domain/repositories/refresh-token.repository';

export interface ResetPasswordInput {
  token: string;
  password: string;
}

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly tokenRepository: PasswordResetTokenRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(TOKEN_HASHER)
    private readonly tokenHasher: TokenHasher,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepository: RefreshTokenRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async execute(input: ResetPasswordInput): Promise<void> {
    const oneTimeToken = OneTimeToken.parse(input.token);

    if (!oneTimeToken) {
      throw new InvalidPasswordResetTokenError();
    }

    const token = await this.tokenRepository.findByUuid(oneTimeToken.uuid);

    if (!token || !token.isUsable(new Date())) {
      throw new InvalidPasswordResetTokenError();
    }

    const hashMatches = this.tokenHasher.verify(
      token.tokenHash,
      oneTimeToken.secret,
    );

    if (!hashMatches) {
      throw new InvalidPasswordResetTokenError();
    }

    const user = await this.userRepository.findById(token.userId);

    if (!user || user.status !== RecordStatus.ACTIVE) {
      throw new InvalidPasswordResetTokenError();
    }

    const hashedPassword = await this.passwordHasher.hash(input.password);

    await this.transactionManager.runInTransaction(async () => {
      const current = await this.userRepository.findByIdForUpdate(user.id);

      if (!current || current.status !== RecordStatus.ACTIVE) {
        throw new InvalidPasswordResetTokenError();
      }

      const withNewPassword = current.withPassword(hashedPassword, current.id);

      await this.userRepository.update(
        withNewPassword.emailConfirmedAt === null
          ? withNewPassword.withEmailConfirmed(new Date())
          : withNewPassword,
      );

      const claimed = await this.tokenRepository.consumeIfUnconsumed(
        token.uuid,
      );

      if (!claimed) {
        throw new InvalidPasswordResetTokenError();
      }

      await this.tokenRepository.consumeAllForUser(user.id);
      await this.refreshTokenRepository.revokeAllForUser(user.id);
    });
  }
}
