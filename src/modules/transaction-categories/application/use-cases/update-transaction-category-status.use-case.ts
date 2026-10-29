import { Inject, Injectable } from '@nestjs/common';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { TransactionCategoryEntity } from '../../domain/entities/transaction-category.entity';
import { assertTransactionCategoryEditable } from '../../domain/policies/assert-transaction-category-editable.policy';
import {
  TRANSACTION_CATEGORY_REPOSITORY,
  type TransactionCategoryRepository,
} from '../../domain/repositories/transaction-category.repository';
import { findVisibleTransactionCategory } from '../services/find-visible-transaction-category';

export interface UpdateTransactionCategoryStatusInput {
  uuid: string;
  ownerId: number;
  status: RecordStatus;
}

@Injectable()
export class UpdateTransactionCategoryStatusUseCase {
  constructor(
    @Inject(TRANSACTION_CATEGORY_REPOSITORY)
    private readonly transactionCategoryRepository: TransactionCategoryRepository,
  ) {}

  async execute(
    input: UpdateTransactionCategoryStatusInput,
  ): Promise<TransactionCategoryEntity> {
    const category = await findVisibleTransactionCategory(
      this.transactionCategoryRepository,
      input.uuid,
      input.ownerId,
    );

    assertTransactionCategoryEditable(category);

    return this.transactionCategoryRepository.update(
      category.withStatus(input.status),
    );
  }
}
