import { TransactionCategoryEntity } from '../../domain/entities/transaction-category.entity';
import { TransactionCategoryNotFoundError } from '../../domain/errors/transaction-category-not-found.error';
import type { TransactionCategoryRepository } from '../../domain/repositories/transaction-category.repository';

export async function findVisibleTransactionCategory(
  transactionCategoryRepository: TransactionCategoryRepository,
  uuid: string,
  ownerId: number,
): Promise<TransactionCategoryEntity> {
  const category = await transactionCategoryRepository.findVisibleByUuid(
    uuid,
    ownerId,
  );

  if (!category) {
    throw new TransactionCategoryNotFoundError();
  }

  return category;
}
