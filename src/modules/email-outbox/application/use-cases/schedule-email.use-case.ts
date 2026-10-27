import { Inject, Injectable, Logger } from '@nestjs/common';
import { normalizeEmail } from '@shared/application/filters';
import { describeError, maskEmail } from '@shared/application/logging';
import {
  EMAIL_QUOTA_PORT,
  TRANSACTION_MANAGER,
  type EmailOutboxPort,
  type EmailQuotaPort,
  type ScheduleEmailRequest,
  type ScheduleEmailResult,
  type TransactionManagerPort,
} from '@shared/application/ports';
import {
  EMAIL_OUTBOX_REPOSITORY,
  type EmailOutboxRepository,
} from '../../domain/repositories/email-outbox.repository';
import {
  REQUEST_LOCALE,
  type RequestLocalePort,
} from '../ports/request-locale.port';

@Injectable()
export class ScheduleEmailUseCase implements EmailOutboxPort {
  private readonly logger = new Logger(ScheduleEmailUseCase.name);

  constructor(
    @Inject(EMAIL_QUOTA_PORT)
    private readonly emailQuota: EmailQuotaPort,
    @Inject(EMAIL_OUTBOX_REPOSITORY)
    private readonly repository: EmailOutboxRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    @Inject(REQUEST_LOCALE)
    private readonly requestLocale: RequestLocalePort,
  ) {}

  async schedule(request: ScheduleEmailRequest): Promise<ScheduleEmailResult> {
    const recipient = normalizeEmail(request.recipient);

    try {
      return await this.transactionManager.runInSavepoint(
        async (): Promise<ScheduleEmailResult> => {
          const quota = await this.emailQuota.tryConsume({
            emailType: request.emailType,
            recipient,
          });

          if (!quota.allowed) {
            return { scheduled: false, reason: quota.reason };
          }

          await this.repository.enqueue({
            emailType: request.emailType,
            recipient,
            locale: this.requestLocale.current(),
            availableAt: new Date(),
          });

          return { scheduled: true };
        },
      );
    } catch (error) {
      this.logger.error({
        msg: 'Failed to schedule email',
        emailType: request.emailType,
        recipient: maskEmail(recipient),
        error: describeError(error),
      });

      return { scheduled: false, reason: 'UNAVAILABLE' };
    }
  }
}
