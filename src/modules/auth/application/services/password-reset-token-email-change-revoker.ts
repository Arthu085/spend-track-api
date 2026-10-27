import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  EMAIL_CHANGE_TOKEN_REVOKERS,
  type EmailChangeTokenRevoker,
  type EmailChangeTokenRevokerRegistry,
} from '@modules/users';
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  type PasswordResetTokenRepository,
} from '../../domain/repositories/password-reset-token.repository';

@Injectable()
export class PasswordResetTokenEmailChangeRevoker
  implements EmailChangeTokenRevoker, OnModuleInit
{
  constructor(
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly tokenRepository: PasswordResetTokenRepository,
    @Inject(EMAIL_CHANGE_TOKEN_REVOKERS)
    private readonly registry: EmailChangeTokenRevokerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  revokeAllForUser(userId: number): Promise<void> {
    return this.tokenRepository.consumeAllForUser(userId);
  }
}
