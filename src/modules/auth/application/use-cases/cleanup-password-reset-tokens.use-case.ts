import { Inject, Injectable } from '@nestjs/common';
import {
  deleteInBatches,
  retentionCutoff,
} from '@shared/application/retention';
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  type PasswordResetTokenRepository,
} from '../../domain/repositories/password-reset-token.repository';

export interface CleanupPasswordResetTokensInput {
  retentionDays: number;
  batchSize: number;
}

@Injectable()
export class CleanupPasswordResetTokensUseCase {
  constructor(
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
  ) {}

  async execute(input: CleanupPasswordResetTokensInput): Promise<number> {
    const cutoff = retentionCutoff(new Date(), input.retentionDays);

    return deleteInBatches(
      (limit) =>
        this.passwordResetTokenRepository.deleteExpiredBefore(cutoff, limit),
      input.batchSize,
    );
  }
}
