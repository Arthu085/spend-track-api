import { Inject, Injectable } from '@nestjs/common';
import {
  deleteInBatches,
  retentionCutoff,
} from '@shared/application/retention';
import {
  EMAIL_OUTBOX_REPOSITORY,
  type EmailOutboxRepository,
} from '../../domain/repositories/email-outbox.repository';

export interface CleanupEmailOutboxInput {
  retentionDays: number;
  batchSize: number;
}

@Injectable()
export class CleanupEmailOutboxUseCase {
  constructor(
    @Inject(EMAIL_OUTBOX_REPOSITORY)
    private readonly repository: EmailOutboxRepository,
  ) {}

  async execute(input: CleanupEmailOutboxInput): Promise<number> {
    const cutoff = retentionCutoff(new Date(), input.retentionDays);

    return deleteInBatches(
      (limit) => this.repository.deleteProcessedBefore(cutoff, limit),
      input.batchSize,
    );
  }
}
