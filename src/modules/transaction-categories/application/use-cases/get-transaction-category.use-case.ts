import { Inject, Injectable } from '@nestjs/common';
import { assertRecordActive } from '@shared/domain/policies';
import { TransactionCategoryEntity } from '../../domain/entities/transaction-category.entity';
import { InactiveTransactionCategoryError } from '../../domain/errors/inactive-transaction-category.error';
import {
  TRANSACTION_CATEGORY_REPOSITORY,
  type TransactionCategoryRepository,
} from '../../domain/repositories/transaction-category.repository';
import { findVisibleTransactionCategory } from '../services/find-visible-transaction-category';

@Injectable()
export class GetTransactionCategoryUseCase {
  constructor(
    @Inject(TRANSACTION_CATEGORY_REPOSITORY)
    private readonly transactionCategoryRepository: TransactionCategoryRepository,
  ) {}

  async execute(
    uuid: string,
    ownerId: number,
  ): Promise<TransactionCategoryEntity> {
    const category = await findVisibleTransactionCategory(
      this.transactionCategoryRepository,
      uuid,
      ownerId,
    );

    assertRecordActive(category, new InactiveTransactionCategoryError());

    return category;
  }
}
