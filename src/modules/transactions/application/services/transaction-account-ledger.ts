import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  ACCOUNT_LEDGERS,
  type AccountLedger,
  type AccountLedgerRegistry,
} from '@modules/accounts';
import { TransactionState } from '../../domain/enums/transaction-state.enum';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../../domain/repositories/transaction.repository';

@Injectable()
export class TransactionAccountLedger implements AccountLedger, OnModuleInit {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: TransactionRepository,
    @Inject(ACCOUNT_LEDGERS)
    private readonly registry: AccountLedgerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  balanceChanges(
    ownerId: number,
    accountIds: readonly number[],
  ): Promise<Map<number, number>> {
    return this.transactionRepository.sumBalanceChanges(ownerId, accountIds, {
      state: TransactionState.COMPLETED,
    });
  }

  hasEntries(ownerId: number, accountId: number): Promise<boolean> {
    return this.transactionRepository.existsForAccount(ownerId, accountId);
  }
}
