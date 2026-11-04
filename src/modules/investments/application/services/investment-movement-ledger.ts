import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  ACCOUNT_LEDGERS,
  type AccountLedger,
  type AccountLedgerRegistry,
} from '@modules/accounts';
import { TransactionState } from '@modules/transactions';
import {
  INVESTMENT_MOVEMENT_REPOSITORY,
  type InvestmentMovementRepository,
} from '../../domain/repositories/investment-movement.repository';

@Injectable()
export class InvestmentMovementLedger implements AccountLedger, OnModuleInit {
  constructor(
    @Inject(INVESTMENT_MOVEMENT_REPOSITORY)
    private readonly movementRepository: InvestmentMovementRepository,
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
    return this.movementRepository.sumAccountChanges(ownerId, accountIds, {
      state: TransactionState.COMPLETED,
    });
  }

  hasEntries(ownerId: number, accountId: number): Promise<boolean> {
    return this.movementRepository.existsForAccount(ownerId, accountId);
  }
}
