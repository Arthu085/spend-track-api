import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { AccountEntity } from '../../domain/entities/account.entity';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
} from '../../domain/repositories/account.repository';
import {
  ACCOUNT_LEDGERS,
  type AccountLedger,
} from '../ports/account-ledger.port';
import { findOwnedAccount } from '../services/find-owned-account';
import { withCurrentBalance } from '../services/with-current-balances';

export interface UpdateAccountStatusInput {
  uuid: string;
  ownerId: number;
  status: RecordStatus;
}

@Injectable()
export class UpdateAccountStatusUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    @Inject(ACCOUNT_LEDGERS)
    private readonly accountLedger: AccountLedger,
  ) {}

  async execute(input: UpdateAccountStatusInput): Promise<AccountEntity> {
    return this.transactionManager.runInTransaction(async () => {
      await this.accountRepository.lockOwnerAccounts(input.ownerId);

      const account = await findOwnedAccount(
        this.accountRepository,
        input.uuid,
        input.ownerId,
      );

      const updated = await this.accountRepository.update(
        account.withStatus(input.status),
      );

      return withCurrentBalance(this.accountLedger, updated);
    });
  }
}
