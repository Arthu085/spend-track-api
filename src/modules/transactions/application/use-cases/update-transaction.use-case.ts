import { Inject, Injectable } from '@nestjs/common';
import {
  ACCOUNT_REPOSITORY,
  type AccountEntity,
  type AccountRepository,
} from '@modules/accounts';
import {
  TRANSACTION_CATEGORY_REPOSITORY,
  type TransactionCategoryEntity,
  type TransactionCategoryRepository,
} from '@modules/transaction-categories';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { TransactionEntity } from '../../domain/entities/transaction.entity';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../../domain/repositories/transaction.repository';
import { lockOwnedTransaction } from '../services/find-owned-transaction';
import {
  findActiveAccount,
  findActiveCategory,
} from '../services/transaction-references';

export interface UpdateTransactionInput {
  uuid: string;
  ownerId: number;
  description?: string;
  amount?: number;
  date?: string;
  accountUuid?: string;
  destinationAccountUuid?: string;
  categoryUuid?: string;
  notes?: string | null;
}

@Injectable()
export class UpdateTransactionUseCase {
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

  async execute(input: UpdateTransactionInput): Promise<TransactionEntity> {
    return this.transactionManager.runInTransaction(async () => {
      await this.accountRepository.lockOwnerAccounts(input.ownerId);

      const transaction = await lockOwnedTransaction(
        this.transactionRepository,
        input.uuid,
        input.ownerId,
      );

      transaction.assertEditable(input);

      return this.transactionRepository.update(
        transaction.withDetails({
          description: input.description ?? transaction.description,
          amount: input.amount ?? transaction.amount,
          date: input.date ?? transaction.date,
          account:
            (await this.changedAccount(
              input.accountUuid,
              transaction.account,
              input.ownerId,
            )) ?? transaction.account,
          destinationAccount: await this.changedAccount(
            input.destinationAccountUuid,
            transaction.destinationAccount,
            input.ownerId,
          ),
          category: await this.changedCategory(
            input.categoryUuid,
            transaction.category,
            input.ownerId,
          ),
          notes: input.notes === undefined ? transaction.notes : input.notes,
        }),
      );
    });
  }

  private async changedAccount(
    uuid: string | undefined,
    current: AccountEntity | null,
    ownerId: number,
  ): Promise<AccountEntity | null> {
    if (uuid === undefined || uuid === current?.uuid) {
      return current;
    }

    return findActiveAccount(this.accountRepository, uuid, ownerId);
  }

  private async changedCategory(
    uuid: string | undefined,
    current: TransactionCategoryEntity | null,
    ownerId: number,
  ): Promise<TransactionCategoryEntity | null> {
    if (uuid === undefined || uuid === current?.uuid) {
      return current;
    }

    return findActiveCategory(this.categoryRepository, uuid, ownerId);
  }
}
