import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppConfigService } from '@core/config';
import { describeError } from '@shared/application/logging';
import { CleanupEmailConfirmationTokensUseCase } from '../../application/use-cases/cleanup-email-confirmation-tokens.use-case';

@Injectable()
export class EmailConfirmationTokenCleanupScheduler {
  private readonly logger = new Logger(
    EmailConfirmationTokenCleanupScheduler.name,
  );

  constructor(
    private readonly cleanupEmailConfirmationTokens: CleanupEmailConfirmationTokensUseCase,
    private readonly config: AppConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'email-confirmation-token-cleanup' })
  async handleCleanup(): Promise<void> {
    const { emailConfirmationTokenDays: retentionDays, batchSize } =
      this.config.retentionCleanup;

    if (retentionDays === 0) {
      return;
    }

    try {
      const deleted = await this.cleanupEmailConfirmationTokens.execute({
        retentionDays,
        batchSize,
      });

      this.logger.log(
        `Email confirmation token cleanup deleted ${deleted} row(s) ` +
          `expired more than ${retentionDays} day(s) ago`,
      );
    } catch (error) {
      this.logger.error({
        msg: 'Email confirmation token cleanup failed',
        error: describeError(error),
      });
    }
  }
}
