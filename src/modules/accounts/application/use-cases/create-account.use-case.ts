import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import {
  AccountEntity,
  type AccountDetails,
} from '../../domain/entities/account.entity';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
} from '../../domain/repositories/account.repository';

export interface CreateAccountInput extends AccountDetails {
  ownerId: number;
  isDefault: boolean;
}

@Injectable()
export class CreateAccountUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async execute(input: CreateAccountInput): Promise<AccountEntity> {
    return this.transactionManager.runInTransaction(async () => {
      if (input.isDefault) {
        await this.accountRepository.lockOwnerAccounts(input.ownerId);
        await this.accountRepository.clearDefault(input.ownerId);
      }

      return this.accountRepository.create(
        AccountEntity.create({ ...input, uuid: randomUUID() }),
      );
    });
  }
}
