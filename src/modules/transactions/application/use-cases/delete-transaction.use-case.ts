import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../../domain/repositories/transaction.repository';
import { lockOwnedTransaction } from '../services/find-owned-transaction';

export interface DeleteTransactionInput {
  uuid: string;
  ownerId: number;
}

@Injectable()
export class DeleteTransactionUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: TransactionRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async execute(input: DeleteTransactionInput): Promise<void> {
    await this.transactionManager.runInTransaction(async () => {
      const transaction = await lockOwnedTransaction(
        this.transactionRepository,
        input.uuid,
        input.ownerId,
      );

      transaction.assertDeletable();

      await this.transactionRepository.softDelete(transaction);
    });
  }
}
