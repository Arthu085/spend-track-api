import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppConfigService } from '@core/config';
import { describeError } from '@shared/application/logging';
import { CleanupAuditLogsUseCase } from '../../application/use-cases/cleanup-audit-logs.use-case';

@Injectable()
export class AuditLogCleanupScheduler {
  private readonly logger = new Logger(AuditLogCleanupScheduler.name);

  constructor(
    private readonly cleanupAuditLogs: CleanupAuditLogsUseCase,
    private readonly config: AppConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'audit-log-cleanup' })
  async handleCleanup(): Promise<void> {
    const { auditLogDays: retentionDays, batchSize } =
      this.config.retentionCleanup;

    if (retentionDays === 0) {
      return;
    }

    try {
      const deleted = await this.cleanupAuditLogs.execute({
        retentionDays,
        batchSize,
      });

      this.logger.log(
        `Audit log cleanup deleted ${deleted} row(s) ` +
          `created more than ${retentionDays} day(s) ago`,
      );
    } catch (error) {
      this.logger.error({
        msg: 'Audit log cleanup failed',
        error: describeError(error),
      });
    }
  }
}
