import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  USER_SESSION_REVOKERS,
  type UserSessionRevoker,
  type UserSessionRevokerRegistry,
} from '@modules/users';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '../../domain/repositories/refresh-token.repository';

@Injectable()
export class RefreshTokenSessionRevoker
  implements UserSessionRevoker, OnModuleInit
{
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepository: RefreshTokenRepository,
    @Inject(USER_SESSION_REVOKERS)
    private readonly registry: UserSessionRevokerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  revokeAllForUser(userId: number): Promise<void> {
    return this.refreshTokenRepository.revokeAllForUser(userId);
  }
}
