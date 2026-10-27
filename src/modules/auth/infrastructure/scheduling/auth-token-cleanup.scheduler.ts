import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppConfigService } from '@core/config';
import { describeError } from '@shared/application/logging';
import { CleanupPasswordResetTokensUseCase } from '../../application/use-cases/cleanup-password-reset-tokens.use-case';
import { CleanupRefreshTokensUseCase } from '../../application/use-cases/cleanup-refresh-tokens.use-case';

@Injectable()
export class AuthTokenCleanupScheduler {
  private readonly logger = new Logger(AuthTokenCleanupScheduler.name);

  constructor(
    private readonly cleanupRefreshTokens: CleanupRefreshTokensUseCase,
    private readonly cleanupPasswordResetTokens: CleanupPasswordResetTokensUseCase,
    private readonly config: AppConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'auth-token-cleanup' })
  async handleCleanup(): Promise<void> {
    await this.cleanupRefreshTokenRows();
    await this.cleanupPasswordResetTokenRows();
  }

  private async cleanupRefreshTokenRows(): Promise<void> {
    const { retentionDays } = this.config.refreshTokenCleanup;

    if (retentionDays === 0) {
      return;
    }

    try {
      const result = await this.cleanupRefreshTokens.execute({ retentionDays });

      this.logger.log(
        `Refresh token cleanup deleted ${result.totalDeleted} row(s): ` +
          `${result.expiredDeleted} expired, ${result.revokedDeleted} revoked ` +
          `more than ${retentionDays} day(s) ago`,
      );
    } catch (error) {
      this.logger.error({
        msg: 'Refresh token cleanup failed',
        error: describeError(error),
      });
    }
  }

  private async cleanupPasswordResetTokenRows(): Promise<void> {
    const { passwordResetTokenDays: retentionDays, batchSize } =
      this.config.retentionCleanup;

    if (retentionDays === 0) {
      return;
    }

    try {
      const deleted = await this.cleanupPasswordResetTokens.execute({
        retentionDays,
        batchSize,
      });

      this.logger.log(
        `Password reset token cleanup deleted ${deleted} row(s) ` +
          `expired more than ${retentionDays} day(s) ago`,
      );
    } catch (error) {
      this.logger.error({
        msg: 'Password reset token cleanup failed',
        error: describeError(error),
      });
    }
  }
}
