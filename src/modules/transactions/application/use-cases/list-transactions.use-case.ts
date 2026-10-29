import { Inject, Injectable } from '@nestjs/common';
import { PaginatedResult } from '@shared/application/dto';
import { normalizeTextFilter } from '@shared/application/filters';
import { TransactionEntity } from '../../domain/entities/transaction.entity';
import {
  TRANSACTION_REPOSITORY,
  type TransactionListFilters,
  type TransactionRepository,
} from '../../domain/repositories/transaction.repository';

export interface ListTransactionsInput extends TransactionListFilters {
  ownerId: number;
  page: number;
  limit: number;
}

@Injectable()
export class ListTransactionsUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: TransactionRepository,
  ) {}

  async execute(
    input: ListTransactionsInput,
  ): Promise<PaginatedResult<TransactionEntity>> {
    const { items, total } =
      await this.transactionRepository.findAllPaginatedByOwner(
        input.ownerId,
        (input.page - 1) * input.limit,
        input.limit,
        {
          from: input.from,
          to: input.to,
          type: input.type,
          state: input.state,
          accountUuid: input.accountUuid,
          categoryUuid: input.categoryUuid,
          description: normalizeTextFilter(input.description),
        },
      );

    return PaginatedResult.of(items, total, input.page, input.limit);
  }
}
