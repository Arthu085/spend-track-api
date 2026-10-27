import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  TOKEN_HASHER,
  type TokenHasher,
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import {
  USER_REPOSITORY,
  type UserRepository,
  assertEmailConfirmed,
} from '@modules/users';
import { EmailNotConfirmedError } from '../../domain/errors/email-not-confirmed.error';
import { InvalidRefreshTokenError } from '../../domain/errors/invalid-refresh-token.error';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '../../domain/repositories/refresh-token.repository';
import { AuthResult } from '../auth-result';
import { TOKEN_SERVICE, type TokenService } from '../ports/token-service.port';
import { IssueAuthTokensService } from '../services/issue-auth-tokens.service';

export interface RefreshTokensInput {
  refreshToken: string | undefined;
}

@Injectable()
export class RefreshTokensUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepository: RefreshTokenRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(TOKEN_HASHER)
    private readonly tokenHasher: TokenHasher,
    private readonly issueAuthTokens: IssueAuthTokensService,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async execute(input: RefreshTokensInput): Promise<AuthResult> {
    if (!input.refreshToken) {
      throw new InvalidRefreshTokenError();
    }

    const payload = await this.tokenService.verifyRefreshToken(
      input.refreshToken,
    );

    if (!payload) {
      throw new InvalidRefreshTokenError();
    }

    const existing = await this.refreshTokenRepository.findByUuid(payload.jti);

    if (!existing) {
      throw new InvalidRefreshTokenError();
    }

    const hashMatches = this.tokenHasher.verify(
      existing.tokenHash,
      input.refreshToken,
    );

    if (!hashMatches || existing.isRevoked()) {
      await this.revokeAllSessions(existing.userId);
      throw new InvalidRefreshTokenError();
    }

    if (!existing.isUsable(new Date())) {
      throw new InvalidRefreshTokenError();
    }

    const user = await this.userRepository.findByUuid(payload.sub);

    if (
      !user ||
      user.id !== existing.userId ||
      user.status !== RecordStatus.ACTIVE
    ) {
      throw new InvalidRefreshTokenError();
    }

    assertEmailConfirmed(user, new EmailNotConfirmedError());

    const replacementUuid = randomUUID();

    const issued = await this.transactionManager.runInTransaction(async () => {
      const current = await this.userRepository.findByIdForUpdate(user.id);

      if (!current || current.status !== RecordStatus.ACTIVE) {
        throw new InvalidRefreshTokenError();
      }

      assertEmailConfirmed(current, new EmailNotConfirmedError());

      const claimed = await this.refreshTokenRepository.revokeIfActive(
        existing.uuid,
        replacementUuid,
      );

      return claimed
        ? this.issueAuthTokens.issue(current, payload.sid, replacementUuid)
        : null;
    });

    if (!issued) {
      await this.revokeAllSessions(existing.userId);
      throw new InvalidRefreshTokenError();
    }

    return {
      user: issued.user,
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      sessionId: issued.sessionId,
    };
  }

  private async revokeAllSessions(userId: number): Promise<void> {
    await this.transactionManager.runInTransaction(async () => {
      await this.userRepository.findByIdForUpdate(userId);
      await this.refreshTokenRepository.revokeAllForUser(userId);
    });
  }
}
