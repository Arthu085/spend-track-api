import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppConfigService } from '@core/config';
import { describeError } from '@shared/application/logging';
import { CleanupEmailSendLogsUseCase } from '../../application/use-cases/cleanup-email-send-logs.use-case';

@Injectable()
export class EmailSendLogCleanupScheduler {
  private readonly logger = new Logger(EmailSendLogCleanupScheduler.name);

  constructor(
    private readonly cleanupEmailSendLogs: CleanupEmailSendLogsUseCase,
    private readonly config: AppConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'email-send-log-cleanup' })
  async handleCleanup(): Promise<void> {
    const { emailSendLogDays: retentionDays, batchSize } =
      this.config.retentionCleanup;

    if (retentionDays === 0) {
      return;
    }

    try {
      const deleted = await this.cleanupEmailSendLogs.execute({
        retentionDays,
        batchSize,
      });

      this.logger.log(
        `Email send log cleanup deleted ${deleted} row(s) ` +
          `created more than ${retentionDays} day(s) ago`,
      );
    } catch (error) {
      this.logger.error({
        msg: 'Email send log cleanup failed',
        error: describeError(error),
      });
    }
  }
}
