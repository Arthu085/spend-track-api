import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ACCOUNT_REPOSITORY, type AccountRepository } from '@modules/accounts';
import {
  TRANSACTION_CATEGORY_REPOSITORY,
  type TransactionCategoryRepository,
} from '@modules/transaction-categories';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { TransactionEntity } from '../../domain/entities/transaction.entity';
import { TransactionState } from '../../domain/enums/transaction-state.enum';
import { TransactionType } from '../../domain/enums/transaction-type.enum';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../../domain/repositories/transaction.repository';
import {
  findActiveAccount,
  findActiveCategory,
} from '../services/transaction-references';

export interface CreateTransactionInput {
  ownerId: number;
  type: TransactionType;
  description: string;
  amount: number;
  date: string;
  state: TransactionState.PLANNED | TransactionState.COMPLETED;
  completedOn?: string;
  accountUuid: string;
  destinationAccountUuid?: string;
  categoryUuid?: string;
  notes?: string | null;
}

@Injectable()
export class CreateTransactionUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: TransactionRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
    @Inject(TRANSACTION_CATEGORY_REPOSITORY)
    private readonly categoryRepository: TransactionCategoryRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async execute(input: CreateTransactionInput): Promise<TransactionEntity> {
    return this.transactionManager.runInTransaction(async () => {
      await this.accountRepository.lockOwnerAccounts(input.ownerId);

      const account = await findActiveAccount(
        this.accountRepository,
        input.accountUuid,
        input.ownerId,
      );

      const destinationAccount = input.destinationAccountUuid
        ? await findActiveAccount(
            this.accountRepository,
            input.destinationAccountUuid,
            input.ownerId,
          )
        : null;

      const category = input.categoryUuid
        ? await findActiveCategory(
            this.categoryRepository,
            input.categoryUuid,
            input.ownerId,
          )
        : null;

      return this.transactionRepository.create(
        TransactionEntity.create({
          uuid: randomUUID(),
          ownerId: input.ownerId,
          type: input.type,
          description: input.description,
          amount: input.amount,
          date: input.date,
          state: input.state,
          completedOn: input.completedOn ?? null,
          account,
          destinationAccount,
          category,
          notes: input.notes ?? null,
        }),
      );
    });
  }
}
