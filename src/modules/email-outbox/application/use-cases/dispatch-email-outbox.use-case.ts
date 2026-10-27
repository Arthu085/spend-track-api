import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '@core/config';
import { describeError } from '@shared/application/logging';
import { HOUR_IN_MS, MINUTE_IN_MS } from '@shared/application/time';
import {
  EMAIL_OUTBOX_REPOSITORY,
  type ClaimedEmailJob,
  type EmailOutboxRepository,
} from '../../domain/repositories/email-outbox.repository';
import { retryDelayMs } from '../retry/retry-delay';
import { EmailJobHandlers } from '../services/email-job-handlers.service';

export const DISPATCH_BATCH_SIZE = 20;

export const DISPATCH_LEASE_MS = 2 * MINUTE_IN_MS;

export const MAX_RETRY_DELAY_MS = HOUR_IN_MS;

const LAST_ERROR_MAX_LENGTH = 1000;

export const LEASE_EXPIRED_ON_FINAL_ATTEMPT =
  'Lease expired during the final attempt';

export interface DispatchEmailOutboxOptions {
  shouldStop?: () => boolean;
}

export interface DispatchEmailOutboxSummary {
  sent: number;
  retried: number;
  failed: number;
}

type DispatchOutcome = keyof DispatchEmailOutboxSummary;

@Injectable()
export class DispatchEmailOutboxUseCase {
  private readonly logger = new Logger(DispatchEmailOutboxUseCase.name);

  constructor(
    @Inject(EMAIL_OUTBOX_REPOSITORY)
    private readonly repository: EmailOutboxRepository,
    private readonly handlers: EmailJobHandlers,
    private readonly config: AppConfigService,
  ) {}

  async execute(
    options: DispatchEmailOutboxOptions = {},
  ): Promise<DispatchEmailOutboxSummary> {
    const { maxAttempts } = this.config.emailOutbox;

    const summary: DispatchEmailOutboxSummary = {
      sent: 0,
      retried: 0,
      failed: await this.failExpiredFinalAttempts(maxAttempts),
    };

    for (let claimed = 0; claimed < DISPATCH_BATCH_SIZE; claimed++) {
      if (options.shouldStop?.()) {
        break;
      }

      const now = new Date();

      const job = await this.repository.claimNext(
        now,
        new Date(now.getTime() + DISPATCH_LEASE_MS),
        maxAttempts,
      );

      if (!job) {
        break;
      }

      summary[await this.dispatch(job)] += 1;
    }

    return summary;
  }

  private async failExpiredFinalAttempts(maxAttempts: number): Promise<number> {
    const failed = await this.repository.failExpiredFinalAttempts(
      new Date(),
      maxAttempts,
      LEASE_EXPIRED_ON_FINAL_ATTEMPT,
    );

    if (failed > 0) {
      this.logger.error({
        msg: 'Email jobs failed permanently: lease expired during the final attempt',
        count: failed,
      });
    }

    return failed;
  }

  private async dispatch(job: ClaimedEmailJob): Promise<DispatchOutcome> {
    try {
      const handler = this.handlers.resolve(job.emailType);

      if (!handler) {
        throw new Error(`No email job handler registered for ${job.emailType}`);
      }

      await handler.handle({
        uuid: job.uuid,
        emailType: job.emailType,
        recipient: job.recipient,
        locale: job.locale,
        attempt: job.attempts,
      });
    } catch (error) {
      return this.recordFailure(job, error);
    }

    const completed = await this.repository.markSent(job, new Date());

    if (!completed) {
      this.logLeaseLost(job);
    }

    return 'sent';
  }

  private async recordFailure(
    job: ClaimedEmailJob,
    error: unknown,
  ): Promise<DispatchOutcome> {
    const message = describeError(error).slice(0, LAST_ERROR_MAX_LENGTH);
    const now = new Date();
    const { maxAttempts, retryBaseDelayMs } = this.config.emailOutbox;

    if (job.attempts >= maxAttempts) {
      if (!(await this.repository.markFailed(job, now, message))) {
        this.logLeaseLost(job);
      }

      this.logger.error({
        msg: 'Email job failed permanently',
        jobId: job.uuid,
        emailType: job.emailType,
        attempts: job.attempts,
        error: message,
      });

      return 'failed';
    }

    const retryAt = new Date(
      now.getTime() +
        retryDelayMs(job.attempts, retryBaseDelayMs, MAX_RETRY_DELAY_MS),
    );

    if (!(await this.repository.scheduleRetry(job, retryAt, message))) {
      this.logLeaseLost(job);
    }

    this.logger.warn({
      msg: 'Email job attempt failed; retry scheduled',
      jobId: job.uuid,
      emailType: job.emailType,
      attempts: job.attempts,
      retryAt: retryAt.toISOString(),
      error: message,
    });

    return 'retried';
  }

  private logLeaseLost(job: ClaimedEmailJob): void {
    this.logger.warn({
      msg: 'Email job lease lost before completion; outcome discarded',
      jobId: job.uuid,
      emailType: job.emailType,
      attempts: job.attempts,
    });
  }
}
