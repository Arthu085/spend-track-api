import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_HASHER, type TokenHasher } from '@shared/application/ports';
import { UserEntity } from '@modules/users';
import { RefreshTokenEntity } from '../../domain/entities/refresh-token.entity';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '../../domain/repositories/refresh-token.repository';
import { TOKEN_SERVICE, type TokenService } from '../ports/token-service.port';
import { AuthResult } from '../auth-result';

export interface IssuedAuthTokens extends AuthResult {
  refreshTokenUuid: string;
}

@Injectable()
export class IssueAuthTokensService {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepository: RefreshTokenRepository,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(TOKEN_HASHER)
    private readonly tokenHasher: TokenHasher,
  ) {}

  async issue(
    user: UserEntity,
    sessionId: string = randomUUID(),
    jti: string = randomUUID(),
  ): Promise<IssuedAuthTokens> {
    const accessToken = this.tokenService.signAccessToken({
      sub: user.uuid,
      email: user.email,
      sid: sessionId,
    });

    const refreshToken = this.tokenService.signRefreshToken({
      sub: user.uuid,
      jti,
      sid: sessionId,
    });

    const tokenHash = this.tokenHasher.hash(refreshToken);

    const refreshTokenEntity = RefreshTokenEntity.issue({
      uuid: jti,
      userId: user.id,
      sessionId,
      tokenHash,
      expiresAt: new Date(Date.now() + this.tokenService.refreshTtlMs()),
    });

    await this.refreshTokenRepository.create(refreshTokenEntity);

    return {
      user,
      accessToken,
      refreshToken,
      sessionId,
      refreshTokenUuid: jti,
    };
  }
}
