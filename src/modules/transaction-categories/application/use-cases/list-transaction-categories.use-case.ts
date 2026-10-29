import { Inject, Injectable } from '@nestjs/common';
import { PaginatedResult } from '@shared/application/dto';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { TransactionCategoryEntity } from '../../domain/entities/transaction-category.entity';
import { TransactionCategoryKind } from '../../domain/enums/transaction-category-kind.enum';
import { TransactionCategoryScope } from '../../domain/enums/transaction-category-scope.enum';
import {
  TRANSACTION_CATEGORY_REPOSITORY,
  type TransactionCategoryRepository,
} from '../../domain/repositories/transaction-category.repository';

export interface ListTransactionCategoriesInput {
  ownerId: number;
  page: number;
  limit: number;
  kind?: TransactionCategoryKind;
  scope?: TransactionCategoryScope;
  status?: RecordStatus;
}

@Injectable()
export class ListTransactionCategoriesUseCase {
  constructor(
    @Inject(TRANSACTION_CATEGORY_REPOSITORY)
    private readonly transactionCategoryRepository: TransactionCategoryRepository,
  ) {}

  async execute(
    input: ListTransactionCategoriesInput,
  ): Promise<PaginatedResult<TransactionCategoryEntity>> {
    const { items, total } =
      await this.transactionCategoryRepository.findAllPaginatedVisibleTo(
        input.ownerId,
        (input.page - 1) * input.limit,
        input.limit,
        {
          kind: input.kind,
          scope: input.scope,
          status: input.status ?? RecordStatus.ACTIVE,
        },
      );

    return PaginatedResult.of(items, total, input.page, input.limit);
  }
}
