import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '@core/config';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import { normalizeEmail } from '@shared/application/filters';
import { describeError, maskEmail } from '@shared/application/logging';
import type {
  EmailQuotaDecision,
  EmailQuotaPort,
  EmailQuotaRequest,
} from '@shared/application/ports';
import { toUtcDay } from '../time/utc-day';
import {
  EMAIL_SEND_LOG_REPOSITORY,
  type EmailSendLogRepository,
} from '../../domain/repositories/email-send-log.repository';

@Injectable()
export class ConsumeEmailQuotaUseCase implements EmailQuotaPort {
  private readonly logger = new Logger(ConsumeEmailQuotaUseCase.name);

  constructor(
    @Inject(EMAIL_SEND_LOG_REPOSITORY)
    private readonly repository: EmailSendLogRepository,
    private readonly config: AppConfigService,
  ) {}

  async tryConsume(request: EmailQuotaRequest): Promise<EmailQuotaDecision> {
    const limit = this.resolveLimit(request.emailType);

    if (limit <= 0) {
      return { allowed: false, reason: 'DISABLED', used: 0, limit };
    }

    const recipient = normalizeEmail(request.recipient);
    const day = toUtcDay(new Date());

    let usedCount: number | null;

    try {
      usedCount = await this.repository.consumeDailySlot({
        emailType: request.emailType,
        recipient,
        day,
        limit,
      });
    } catch (error) {
      this.logger.error({
        msg: 'Email send quota unavailable; send denied',
        emailType: request.emailType,
        recipient: maskEmail(recipient),
        error: describeError(error),
      });

      return { allowed: false, reason: 'UNAVAILABLE', used: 0, limit };
    }

    if (usedCount === null) {
      this.logger.warn({
        msg: 'Email send quota exhausted',
        emailType: request.emailType,
        recipient: maskEmail(recipient),
        limit,
        day,
      });

      return { allowed: false, reason: 'EXHAUSTED', used: limit, limit };
    }

    return { allowed: true, used: usedCount, limit };
  }

  private resolveLimit(emailType: EmailType): number {
    const limitsByType: Record<EmailType, number> = {
      [EmailType.PASSWORD_RESET]:
        this.config.emailQuota.passwordResetDailyLimit,
      [EmailType.EMAIL_CONFIRMATION]:
        this.config.emailQuota.emailConfirmationDailyLimit,
      [EmailType.USER_CHANGE_REQUEST]:
        this.config.emailQuota.userChangeRequestDailyLimit,
      [EmailType.EMAIL_CHANGE_NOTICE]:
        this.config.emailQuota.emailChangeNoticeDailyLimit,
    };

    return limitsByType[emailType];
  }
}
