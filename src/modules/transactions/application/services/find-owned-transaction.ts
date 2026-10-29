import { TransactionEntity } from '../../domain/entities/transaction.entity';
import { TransactionNotFoundError } from '../../domain/errors/transaction-not-found.error';
import type { TransactionRepository } from '../../domain/repositories/transaction.repository';

export async function findOwnedTransaction(
  transactionRepository: TransactionRepository,
  uuid: string,
  ownerId: number,
): Promise<TransactionEntity> {
  return orNotFound(
    await transactionRepository.findByUuidForOwner(uuid, ownerId),
  );
}

export async function lockOwnedTransaction(
  transactionRepository: TransactionRepository,
  uuid: string,
  ownerId: number,
): Promise<TransactionEntity> {
  return orNotFound(
    await transactionRepository.findByUuidForOwnerForUpdate(uuid, ownerId),
  );
}

function orNotFound(transaction: TransactionEntity | null): TransactionEntity {
  if (!transaction) {
    throw new TransactionNotFoundError();
  }

  return transaction;
}
