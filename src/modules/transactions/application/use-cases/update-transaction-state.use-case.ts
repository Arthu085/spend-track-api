import { Inject, Injectable } from '@nestjs/common';
import {
  ACCOUNT_REPOSITORY,
  InactiveAccountError,
  type AccountRepository,
} from '@modules/accounts';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { financeToday } from '@shared/domain/calendar';
import { assertRecordActive } from '@shared/domain/policies';
import { TransactionEntity } from '../../domain/entities/transaction.entity';
import { TransactionState } from '../../domain/enums/transaction-state.enum';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../../domain/repositories/transaction.repository';
import { lockOwnedTransaction } from '../services/find-owned-transaction';

export interface UpdateTransactionStateInput {
  uuid: string;
  ownerId: number;
  state: TransactionState.COMPLETED | TransactionState.CANCELED;
  completedOn?: string;
}

@Injectable()
export class UpdateTransactionStateUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: TransactionRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async execute(
    input: UpdateTransactionStateInput,
  ): Promise<TransactionEntity> {
    return this.transactionManager.runInTransaction(async () => {
      await this.accountRepository.lockOwnerAccounts(input.ownerId);

      const transaction = await lockOwnedTransaction(
        this.transactionRepository,
        input.uuid,
        input.ownerId,
      );

      return this.transactionRepository.update(
        input.state === TransactionState.COMPLETED
          ? this.complete(transaction, input.completedOn ?? financeToday())
          : transaction.cancel(),
      );
    });
  }

  private complete(
    transaction: TransactionEntity,
    completedOn: string,
  ): TransactionEntity {
    const completed = transaction.complete(completedOn);

    for (const account of [
      transaction.account,
      transaction.destinationAccount,
    ]) {
      if (account) {
        assertRecordActive(account, new InactiveAccountError());
      }
    }

    return completed;
  }
}
