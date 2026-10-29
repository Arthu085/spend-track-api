import { Inject, Injectable } from '@nestjs/common';
import { assertTransactionCategoryEditable } from '../../domain/policies/assert-transaction-category-editable.policy';
import {
  TRANSACTION_CATEGORY_REPOSITORY,
  type TransactionCategoryRepository,
} from '../../domain/repositories/transaction-category.repository';
import { findVisibleTransactionCategory } from '../services/find-visible-transaction-category';

export interface DeleteTransactionCategoryInput {
  uuid: string;
  ownerId: number;
}

@Injectable()
export class DeleteTransactionCategoryUseCase {
  constructor(
    @Inject(TRANSACTION_CATEGORY_REPOSITORY)
    private readonly transactionCategoryRepository: TransactionCategoryRepository,
  ) {}

  async execute(input: DeleteTransactionCategoryInput): Promise<void> {
    const category = await findVisibleTransactionCategory(
      this.transactionCategoryRepository,
      input.uuid,
      input.ownerId,
    );

    assertTransactionCategoryEditable(category);

    await this.transactionCategoryRepository.softDelete(category);
  }
}
