import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  PASSWORD_CHANGE_TOKEN_REVOKERS,
  type PasswordChangeTokenRevoker,
  type PasswordChangeTokenRevokerRegistry,
} from '@modules/users';
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  type PasswordResetTokenRepository,
} from '../../domain/repositories/password-reset-token.repository';

@Injectable()
export class PasswordResetTokenPasswordChangeRevoker
  implements PasswordChangeTokenRevoker, OnModuleInit
{
  constructor(
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly tokenRepository: PasswordResetTokenRepository,
    @Inject(PASSWORD_CHANGE_TOKEN_REVOKERS)
    private readonly registry: PasswordChangeTokenRevokerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  revokeAllForUser(userId: number): Promise<void> {
    return this.tokenRepository.consumeAllForUser(userId);
  }
}
