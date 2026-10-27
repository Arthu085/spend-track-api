import { Inject, Injectable } from '@nestjs/common';
import { UnauthorizedError } from '@shared/domain/errors';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  USER_REPOSITORY,
  type AuthSubject,
  type UserRepository,
  assertEmailConfirmed,
} from '@modules/users';
import { EmailNotConfirmedError } from '../../domain/errors/email-not-confirmed.error';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '../../domain/repositories/refresh-token.repository';

export interface ValidateAccessTokenUserInput {
  userUuid: string;
  sessionId: string;
}

@Injectable()
export class ValidateAccessTokenUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}

  async execute(input: ValidateAccessTokenUserInput): Promise<AuthSubject> {
    const subject = await this.userRepository.findAuthSubject(input.userUuid);

    if (!subject || subject.status !== RecordStatus.ACTIVE) {
      throw new UnauthorizedError('auth.errors.unauthenticated');
    }

    const sessionActive = await this.refreshTokenRepository.hasActiveSession(
      subject.id,
      input.sessionId,
      new Date(),
    );

    if (!sessionActive) {
      throw new UnauthorizedError('auth.errors.unauthenticated');
    }

    assertEmailConfirmed(subject, new EmailNotConfirmedError());

    return subject;
  }
}
