import { Inject, Injectable } from '@nestjs/common';
import {
  deleteInBatches,
  retentionCutoff,
} from '@shared/application/retention';
import {
  EMAIL_SEND_LOG_REPOSITORY,
  type EmailSendLogRepository,
} from '../../domain/repositories/email-send-log.repository';

export interface CleanupEmailSendLogsInput {
  retentionDays: number;
  batchSize: number;
}

@Injectable()
export class CleanupEmailSendLogsUseCase {
  constructor(
    @Inject(EMAIL_SEND_LOG_REPOSITORY)
    private readonly emailSendLogRepository: EmailSendLogRepository,
  ) {}

  async execute(input: CleanupEmailSendLogsInput): Promise<number> {
    const cutoff = retentionCutoff(new Date(), input.retentionDays);

    return deleteInBatches(
      (limit) => this.emailSendLogRepository.deleteCreatedBefore(cutoff, limit),
      input.batchSize,
    );
  }
}
