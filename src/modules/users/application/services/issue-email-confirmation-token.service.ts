import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@core/config';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  TOKEN_HASHER,
  TRANSACTION_MANAGER,
  type EmailJob,
  type TokenHasher,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { HOUR_IN_MS } from '@shared/application/time';
import { OneTimeToken } from '@shared/application/tokens';
import { UserEntity } from '../../domain/entities/user.entity';
import { EmailConfirmationTokenEntity } from '../../domain/entities/email-confirmation-token.entity';
import {
  EMAIL_CONFIRMATION_TOKEN_REPOSITORY,
  type EmailConfirmationTokenRepository,
} from '../../domain/repositories/email-confirmation-token.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/repositories/user.repository';
import { USER_NOTIFIER, type UserNotifier } from '../ports/user-notifier.port';

@Injectable()
export class IssueEmailConfirmationTokenService {
  constructor(
    @Inject(EMAIL_CONFIRMATION_TOKEN_REPOSITORY)
    private readonly tokenRepository: EmailConfirmationTokenRepository,
    @Inject(TOKEN_HASHER)
    private readonly tokenHasher: TokenHasher,
    @Inject(USER_NOTIFIER)
    private readonly userNotifier: UserNotifier,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly config: AppConfigService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async issueFor(userId: number, job: EmailJob): Promise<void> {
    const issued = await this.transactionManager.runInTransaction(async () => {
      const current = await this.userRepository.findByIdForUpdate(userId);

      if (
        !current ||
        current.email !== job.recipient ||
        current.status !== RecordStatus.ACTIVE ||
        current.emailConfirmedAt !== null
      ) {
        return null;
      }

      return { current, oneTimeToken: await this.persistFor(current) };
    });

    if (!issued) {
      return;
    }

    await this.userNotifier.sendEmailConfirmation({
      email: issued.current.email,
      name: issued.current.name,
      token: issued.oneTimeToken.toString(),
      locale: job.locale,
    });
  }

  private async persistFor(user: UserEntity): Promise<OneTimeToken> {
    await this.tokenRepository.consumeAllForUser(user.id);

    const oneTimeToken = OneTimeToken.issue();
    const tokenHash = this.tokenHasher.hash(oneTimeToken.secret);

    const ttlMs =
      this.config.verificationTokens.emailConfirmationTtlHours * HOUR_IN_MS;

    const token = EmailConfirmationTokenEntity.issue({
      uuid: oneTimeToken.uuid,
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + ttlMs),
    });

    await this.tokenRepository.create(token);

    return oneTimeToken;
  }
}
