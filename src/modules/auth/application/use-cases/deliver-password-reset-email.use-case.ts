import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '@core/config';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import {
  EMAIL_JOB_HANDLER_REGISTRY,
  TOKEN_HASHER,
  TRANSACTION_MANAGER,
  type EmailJob,
  type EmailJobHandler,
  type EmailJobHandlerRegistry,
  type TokenHasher,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { MINUTE_IN_MS } from '@shared/application/time';
import { OneTimeToken } from '@shared/application/tokens';
import {
  USER_NOTIFIER,
  type UserNotifier,
  USER_REPOSITORY,
  type UserRepository,
  UserEntity,
} from '@modules/users';
import { PasswordResetTokenEntity } from '../../domain/entities/password-reset-token.entity';
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  type PasswordResetTokenRepository,
} from '../../domain/repositories/password-reset-token.repository';

@Injectable()
export class DeliverPasswordResetEmailUseCase
  implements EmailJobHandler, OnModuleInit
{
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly tokenRepository: PasswordResetTokenRepository,
    @Inject(TOKEN_HASHER)
    private readonly tokenHasher: TokenHasher,
    @Inject(USER_NOTIFIER)
    private readonly userNotifier: UserNotifier,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    @Inject(EMAIL_JOB_HANDLER_REGISTRY)
    private readonly handlerRegistry: EmailJobHandlerRegistry,
    private readonly config: AppConfigService,
  ) {}

  onModuleInit(): void {
    this.handlerRegistry.register(EmailType.PASSWORD_RESET, this);
  }

  async handle(job: EmailJob): Promise<void> {
    const user = await this.userRepository.findByEmail(job.recipient);

    if (!user || user.status !== RecordStatus.ACTIVE) {
      return;
    }

    const issued = await this.transactionManager.runInTransaction(async () => {
      const current = await this.userRepository.findByIdForUpdate(user.id);

      if (
        !current ||
        current.email !== job.recipient ||
        current.status !== RecordStatus.ACTIVE
      ) {
        return null;
      }

      return { current, oneTimeToken: await this.issueToken(current) };
    });

    if (!issued) {
      return;
    }

    await this.userNotifier.sendPasswordReset({
      email: issued.current.email,
      name: issued.current.name,
      token: issued.oneTimeToken.toString(),
      locale: job.locale,
    });
  }

  private async issueToken(user: UserEntity): Promise<OneTimeToken> {
    await this.tokenRepository.consumeAllForUser(user.id);

    const oneTimeToken = OneTimeToken.issue();
    const tokenHash = this.tokenHasher.hash(oneTimeToken.secret);

    const ttlMs =
      this.config.verificationTokens.passwordResetTtlMinutes * MINUTE_IN_MS;

    const token = PasswordResetTokenEntity.issue({
      uuid: oneTimeToken.uuid,
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + ttlMs),
    });

    await this.tokenRepository.create(token);

    return oneTimeToken;
  }
}
