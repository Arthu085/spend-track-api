import { randomBytes } from 'node:crypto';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { normalizeEmail } from '@shared/application/filters';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
  USER_REPOSITORY,
  type UserEntity,
  type UserRepository,
  assertEmailConfirmed,
} from '@modules/users';
import { EmailNotConfirmedError } from '../../domain/errors/email-not-confirmed.error';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { UserInactiveError } from '../../domain/errors/user-inactive.error';
import { AuthResult } from '../auth-result';
import { IssueAuthTokensService } from '../services/issue-auth-tokens.service';

export interface LoginInput {
  email: string;
  password: string;
}

@Injectable()
export class LoginUseCase implements OnModuleInit {
  private dummyPasswordHash?: Promise<string>;

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    private readonly issueAuthTokens: IssueAuthTokensService,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.getDummyPasswordHash();
  }

  async execute(input: LoginInput): Promise<AuthResult> {
    const user = await this.userRepository.findByEmail(
      normalizeEmail(input.email),
    );

    if (!user) {
      await this.passwordHasher.verify(
        await this.getDummyPasswordHash(),
        input.password,
      );
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await this.passwordHasher.verify(
      user.password,
      input.password,
    );

    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }

    this.assertMaySignIn(user);

    const issued = await this.transactionManager.runInTransaction(async () => {
      const current = await this.userRepository.findByIdForUpdate(user.id);

      if (!current || current.password !== user.password) {
        throw new InvalidCredentialsError();
      }

      this.assertMaySignIn(current);

      return this.issueAuthTokens.issue(current);
    });

    return {
      user: issued.user,
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      sessionId: issued.sessionId,
    };
  }

  private assertMaySignIn(user: UserEntity): void {
    if (user.status !== RecordStatus.ACTIVE) {
      throw new UserInactiveError();
    }

    assertEmailConfirmed(user, new EmailNotConfirmedError());
  }

  private getDummyPasswordHash(): Promise<string> {
    this.dummyPasswordHash ??= this.passwordHasher.hash(
      randomBytes(32).toString('base64url'),
    );

    return this.dummyPasswordHash;
  }
}
