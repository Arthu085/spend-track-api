import { Inject, Injectable } from '@nestjs/common';
import {
  TOKEN_HASHER,
  type TokenHasher,
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { OneTimeToken } from '@shared/application/tokens';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/repositories/user.repository';
import {
  EMAIL_CONFIRMATION_TOKEN_REPOSITORY,
  type EmailConfirmationTokenRepository,
} from '../../domain/repositories/email-confirmation-token.repository';
import { InvalidEmailConfirmationTokenError } from '../../domain/errors/invalid-email-confirmation-token.error';

export interface ConfirmEmailInput {
  token: string;
}

@Injectable()
export class ConfirmEmailUseCase {
  constructor(
    @Inject(EMAIL_CONFIRMATION_TOKEN_REPOSITORY)
    private readonly tokenRepository: EmailConfirmationTokenRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(TOKEN_HASHER)
    private readonly tokenHasher: TokenHasher,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async execute(input: ConfirmEmailInput): Promise<void> {
    const oneTimeToken = OneTimeToken.parse(input.token);

    if (!oneTimeToken) {
      throw new InvalidEmailConfirmationTokenError();
    }

    const token = await this.tokenRepository.findByUuid(oneTimeToken.uuid);

    if (!token || !token.isUsable(new Date())) {
      throw new InvalidEmailConfirmationTokenError();
    }

    const hashMatches = this.tokenHasher.verify(
      token.tokenHash,
      oneTimeToken.secret,
    );

    if (!hashMatches) {
      throw new InvalidEmailConfirmationTokenError();
    }

    await this.transactionManager.runInTransaction(async () => {
      const user = await this.userRepository.findByIdForUpdate(token.userId);

      if (!user) {
        throw new InvalidEmailConfirmationTokenError();
      }

      const claimed = await this.tokenRepository.consumeIfUnconsumed(
        token.uuid,
      );

      if (!claimed) {
        throw new InvalidEmailConfirmationTokenError();
      }

      if (user.emailConfirmedAt === null) {
        await this.userRepository.update(user.withEmailConfirmed(new Date()));
      }
    });
  }
}
