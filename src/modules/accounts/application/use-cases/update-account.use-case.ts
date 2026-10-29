import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { assertRecordActive } from '@shared/domain/policies';
import {
  AccountEntity,
  type AccountDetails,
} from '../../domain/entities/account.entity';
import { InactiveAccountError } from '../../domain/errors/inactive-account.error';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
} from '../../domain/repositories/account.repository';
import { findOwnedAccount } from '../services/find-owned-account';

export interface UpdateAccountInput extends Partial<AccountDetails> {
  uuid: string;
  ownerId: number;
  isDefault?: boolean;
}

@Injectable()
export class UpdateAccountUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async execute(input: UpdateAccountInput): Promise<AccountEntity> {
    return this.transactionManager.runInTransaction(async () => {
      await this.accountRepository.lockOwnerAccounts(input.ownerId);

      const account = await findOwnedAccount(
        this.accountRepository,
        input.uuid,
        input.ownerId,
      );

      assertRecordActive(account, new InactiveAccountError());

      const isDefault = input.isDefault ?? account.isDefault;

      if (isDefault && !account.isDefault) {
        await this.accountRepository.clearDefault(input.ownerId);
      }

      return this.accountRepository.update(
        account
          .withDetails({
            name: input.name ?? account.name,
            type: input.type ?? account.type,
            openingBalance: input.openingBalance ?? account.openingBalance,
            openingBalanceDate:
              input.openingBalanceDate ?? account.openingBalanceDate,
          })
          .withDefault(isDefault),
      );
    });
  }
}
