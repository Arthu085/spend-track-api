import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppConfigService } from '@core/config';
import { describeError } from '@shared/application/logging';
import { CleanupEmailOutboxUseCase } from '../../application/use-cases/cleanup-email-outbox.use-case';

@Injectable()
export class EmailOutboxCleanupScheduler {
  private readonly logger = new Logger(EmailOutboxCleanupScheduler.name);

  constructor(
    private readonly cleanupEmailOutbox: CleanupEmailOutboxUseCase,
    private readonly config: AppConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'email-outbox-cleanup' })
  async handleCleanup(): Promise<void> {
    const { emailOutboxDays: retentionDays, batchSize } =
      this.config.retentionCleanup;

    if (retentionDays === 0) {
      return;
    }

    try {
      const deleted = await this.cleanupEmailOutbox.execute({
        retentionDays,
        batchSize,
      });

      this.logger.log(
        `Email outbox cleanup deleted ${deleted} job(s) ` +
          `processed more than ${retentionDays} day(s) ago`,
      );
    } catch (error) {
      this.logger.error({
        msg: 'Email outbox cleanup failed',
        error: describeError(error),
      });
    }
  }
}
