import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { USER_REPOSITORY, type UserRepository } from '@modules/users';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '../../domain/repositories/refresh-token.repository';

export interface LogoutInput {
  userUuid: string;
}

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepository: RefreshTokenRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async execute(input: LogoutInput): Promise<void> {
    await this.transactionManager.runInTransaction(async () => {
      const user = await this.userRepository.findByUuidForUpdate(
        input.userUuid,
      );

      if (!user) {
        return;
      }

      await this.refreshTokenRepository.revokeAllForUser(user.id);
    });
  }
}
