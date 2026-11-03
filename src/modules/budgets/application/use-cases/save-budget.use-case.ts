import { Inject, Injectable } from '@nestjs/common';
import {
  InactiveTransactionCategoryError,
  TRANSACTION_CATEGORY_REPOSITORY,
  TransactionCategoryKind,
  findVisibleTransactionCategory,
  type TransactionCategoryEntity,
  type TransactionCategoryRepository,
} from '@modules/transaction-categories';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import { firstDayOf } from '@shared/domain/calendar';
import { assertRecordActive } from '@shared/domain/policies';
import { BudgetCategoryNotExpenseError } from '../../domain/errors/budget-category-not-expense.error';
import { EmptyBudgetError } from '../../domain/errors/empty-budget.error';
import {
  BUDGET_REPOSITORY,
  type BudgetCategoryLimit,
  type BudgetRepository,
} from '../../domain/repositories/budget.repository';
import type { BudgetMonthInput, MonthlyBudget } from './get-budget.use-case';

export interface SaveBudgetInput extends BudgetMonthInput {
  totalLimit: number | null;
  categoryLimits: Array<{ categoryUuid: string; limit: number }>;
}

@Injectable()
export class SaveBudgetUseCase {
  constructor(
    @Inject(BUDGET_REPOSITORY)
    private readonly budgetRepository: BudgetRepository,
    @Inject(TRANSACTION_CATEGORY_REPOSITORY)
    private readonly transactionCategoryRepository: TransactionCategoryRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
  ) {}

  async execute(input: SaveBudgetInput): Promise<MonthlyBudget> {
    if (input.totalLimit === null && input.categoryLimits.length === 0) {
      throw new EmptyBudgetError();
    }

    const period = { year: input.year, month: input.month };
    const month = firstDayOf(period);

    const saved = await this.transactionManager.runInTransaction(async () => {
      const stored = await this.budgetRepository.findByMonth(
        input.ownerId,
        month,
      );

      const budgeted = new Map(
        (stored?.categoryLimits ?? []).map(({ category }) => [
          category.uuid,
          category,
        ]),
      );

      const categoryLimits: BudgetCategoryLimit[] = [];

      for (const entry of input.categoryLimits) {
        categoryLimits.push({
          category:
            budgeted.get(entry.categoryUuid) ??
            (await this.findBudgetableCategory(
              entry.categoryUuid,
              input.ownerId,
            )),
          limit: entry.limit,
        });
      }

      return this.budgetRepository.save(input.ownerId, month, {
        totalLimit: input.totalLimit,
        categoryLimits,
      });
    });

    return {
      period,
      totalLimit: saved.totalLimit,
      categoryLimits: saved.categoryLimits,
      updatedAt: saved.updatedAt,
    };
  }

  private async findBudgetableCategory(
    uuid: string,
    ownerId: number,
  ): Promise<TransactionCategoryEntity> {
    const category = await findVisibleTransactionCategory(
      this.transactionCategoryRepository,
      uuid,
      ownerId,
    );

    if (category.kind !== TransactionCategoryKind.EXPENSE) {
      throw new BudgetCategoryNotExpenseError();
    }

    assertRecordActive(category, new InactiveTransactionCategoryError());

    return category;
  }
}
