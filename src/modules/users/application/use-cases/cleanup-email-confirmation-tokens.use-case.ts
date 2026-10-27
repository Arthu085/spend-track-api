import { Inject, Injectable } from '@nestjs/common';
import {
  deleteInBatches,
  retentionCutoff,
} from '@shared/application/retention';
import {
  EMAIL_CONFIRMATION_TOKEN_REPOSITORY,
  type EmailConfirmationTokenRepository,
} from '../../domain/repositories/email-confirmation-token.repository';

export interface CleanupEmailConfirmationTokensInput {
  retentionDays: number;
  batchSize: number;
}

@Injectable()
export class CleanupEmailConfirmationTokensUseCase {
  constructor(
    @Inject(EMAIL_CONFIRMATION_TOKEN_REPOSITORY)
    private readonly emailConfirmationTokenRepository: EmailConfirmationTokenRepository,
  ) {}

  async execute(input: CleanupEmailConfirmationTokensInput): Promise<number> {
    const cutoff = retentionCutoff(new Date(), input.retentionDays);

    return deleteInBatches(
      (limit) =>
        this.emailConfirmationTokenRepository.deleteExpiredBefore(
          cutoff,
          limit,
        ),
      input.batchSize,
    );
  }
}
