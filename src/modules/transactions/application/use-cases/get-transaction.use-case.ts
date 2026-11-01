import { Inject, Injectable } from '@nestjs/common';
import { TransactionEntity } from '../../domain/entities/transaction.entity';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../../domain/repositories/transaction.repository';
import { findOwnedTransaction } from '../services/find-owned-transaction';

@Injectable()
export class GetTransactionUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: TransactionRepository,
  ) {}

  execute(uuid: string, ownerId: number): Promise<TransactionEntity> {
    return findOwnedTransaction(this.transactionRepository, uuid, ownerId);
  }
}
