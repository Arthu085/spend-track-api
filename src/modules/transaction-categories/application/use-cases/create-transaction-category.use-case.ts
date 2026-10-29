import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  TransactionCategoryEntity,
  type TransactionCategoryDetails,
} from '../../domain/entities/transaction-category.entity';
import { TransactionCategoryKind } from '../../domain/enums/transaction-category-kind.enum';
import {
  TRANSACTION_CATEGORY_REPOSITORY,
  type TransactionCategoryRepository,
} from '../../domain/repositories/transaction-category.repository';

export interface CreateTransactionCategoryInput extends TransactionCategoryDetails {
  ownerId: number;
  kind: TransactionCategoryKind;
}

@Injectable()
export class CreateTransactionCategoryUseCase {
  constructor(
    @Inject(TRANSACTION_CATEGORY_REPOSITORY)
    private readonly transactionCategoryRepository: TransactionCategoryRepository,
  ) {}

  async execute(
    input: CreateTransactionCategoryInput,
  ): Promise<TransactionCategoryEntity> {
    return this.transactionCategoryRepository.create(
      TransactionCategoryEntity.createPersonal({
        ...input,
        uuid: randomUUID(),
      }),
    );
  }
}
