import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { AccountHasHistoryError } from '../../domain/errors/account-has-history.error';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
} from '../../domain/repositories/account.repository';
import {
  ACCOUNT_LEDGERS,
  type AccountLedger,
} from '../ports/account-ledger.port';
import { findOwnedAccount } from '../services/find-owned-account';

export interface DeleteAccountInput {
  uuid: string;
  ownerId: number;
}

@Injectable()
export class DeleteAccountUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    @Inject(ACCOUNT_LEDGERS)
    private readonly accountLedger: AccountLedger,
  ) {}

  async execute(input: DeleteAccountInput): Promise<void> {
    await this.transactionManager.runInTransaction(async () => {
      await this.accountRepository.lockOwnerAccounts(input.ownerId);

      const account = await findOwnedAccount(
        this.accountRepository,
        input.uuid,
        input.ownerId,
      );

      if (await this.accountLedger.hasEntries(input.ownerId, account.id)) {
        throw new AccountHasHistoryError();
      }

      await this.accountRepository.softDelete(account);
    });
  }
}
