import { Inject, Injectable } from '@nestjs/common';
import { retentionCutoff } from '@shared/application/retention';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '../../domain/repositories/refresh-token.repository';

export interface CleanupRefreshTokensInput {
  retentionDays: number;
}

export interface CleanupRefreshTokensResult {
  expiredDeleted: number;
  revokedDeleted: number;
  totalDeleted: number;
}

@Injectable()
export class CleanupRefreshTokensUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}

  async execute(
    input: CleanupRefreshTokensInput,
  ): Promise<CleanupRefreshTokensResult> {
    const now = new Date();

    const threshold = retentionCutoff(now, input.retentionDays);

    const expiredDeleted =
      await this.refreshTokenRepository.deleteExpiredBefore(now);

    const revokedDeleted =
      await this.refreshTokenRepository.deleteRevokedBefore(threshold);

    return {
      expiredDeleted,
      revokedDeleted,
      totalDeleted: expiredDeleted + revokedDeleted,
    };
  }
}
