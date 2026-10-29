import { Inject, Injectable } from '@nestjs/common';
import { assertRecordActive } from '@shared/domain/policies';
import { TransactionCategoryEntity } from '../../domain/entities/transaction-category.entity';
import { InactiveTransactionCategoryError } from '../../domain/errors/inactive-transaction-category.error';
import { assertTransactionCategoryEditable } from '../../domain/policies/assert-transaction-category-editable.policy';
import {
  TRANSACTION_CATEGORY_REPOSITORY,
  type TransactionCategoryRepository,
} from '../../domain/repositories/transaction-category.repository';
import { findVisibleTransactionCategory } from '../services/find-visible-transaction-category';

export interface UpdateTransactionCategoryInput {
  uuid: string;
  ownerId: number;
  name?: string;
  color?: string;
}

@Injectable()
export class UpdateTransactionCategoryUseCase {
  constructor(
    @Inject(TRANSACTION_CATEGORY_REPOSITORY)
    private readonly transactionCategoryRepository: TransactionCategoryRepository,
  ) {}

  async execute(
    input: UpdateTransactionCategoryInput,
  ): Promise<TransactionCategoryEntity> {
    const category = await findVisibleTransactionCategory(
      this.transactionCategoryRepository,
      input.uuid,
      input.ownerId,
    );

    assertTransactionCategoryEditable(category);
    assertRecordActive(category, new InactiveTransactionCategoryError());

    return this.transactionCategoryRepository.update(
      category.withDetails({
        name: input.name ?? category.name,
        color: input.color ?? category.color,
      }),
    );
  }
}
