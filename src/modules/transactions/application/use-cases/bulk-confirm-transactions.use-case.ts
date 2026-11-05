import { Inject, Injectable } from '@nestjs/common';
import { ACCOUNT_REPOSITORY, type AccountRepository } from '@modules/accounts';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { DomainError } from '@shared/domain/errors';
import type { TransactionEntity } from '../../domain/entities/transaction.entity';
import { BulkConfirmationOutcome } from '../../domain/enums/bulk-confirmation-outcome.enum';
import { TransactionState } from '../../domain/enums/transaction-state.enum';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../../domain/repositories/transaction.repository';
import { lockOwnedTransaction } from '../services/find-owned-transaction';
import { UpdateTransactionStateUseCase } from './update-transaction-state.use-case';

export interface BulkConfirmationItem {
  uuid: string;
  completedOn?: string;
}

export interface BulkConfirmationResult {
  uuid: string;
  outcome: BulkConfirmationOutcome;
  transaction: TransactionEntity | null;
  error: DomainError | null;
}

@Injectable()
export class BulkConfirmTransactionsUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: TransactionRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly updateState: UpdateTransactionStateUseCase,
  ) {}

  async execute(
    ownerId: number,
    items: readonly BulkConfirmationItem[],
  ): Promise<BulkConfirmationResult[]> {
    return this.transactionManager.runInTransaction(async () => {
      await this.accountRepository.lockOwnerAccounts(ownerId);

      const results: BulkConfirmationResult[] = [];

      for (const item of items) {
        results.push(await this.confirm(ownerId, item));
      }

      return results;
    });
  }

  private async confirm(
    ownerId: number,
    item: BulkConfirmationItem,
  ): Promise<BulkConfirmationResult> {
    try {
      return await this.transactionManager.runInSavepoint(() =>
        this.confirmLocked(ownerId, item),
      );
    } catch (error) {
      if (error instanceof DomainError) {
        return {
          uuid: item.uuid,
          outcome: BulkConfirmationOutcome.FAILED,
          transaction: null,
          error,
        };
      }

      throw error;
    }
  }

  private async confirmLocked(
    ownerId: number,
    item: BulkConfirmationItem,
  ): Promise<BulkConfirmationResult> {
    const transaction = await lockOwnedTransaction(
      this.transactionRepository,
      item.uuid,
      ownerId,
    );

    if (transaction.state === TransactionState.COMPLETED) {
      return {
        uuid: item.uuid,
        outcome: BulkConfirmationOutcome.ALREADY_COMPLETED,
        transaction,
        error: null,
      };
    }

    return {
      uuid: item.uuid,
      outcome: BulkConfirmationOutcome.CONFIRMED,
      transaction: await this.updateState.execute({
        uuid: item.uuid,
        ownerId,
        state: TransactionState.COMPLETED,
        completedOn: item.completedOn,
      }),
      error: null,
    };
  }
}
