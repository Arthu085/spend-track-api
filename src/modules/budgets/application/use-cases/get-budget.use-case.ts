import { Inject, Injectable } from '@nestjs/common';
import { firstDayOf, type MonthRef } from '@shared/domain/calendar';
import {
  BUDGET_REPOSITORY,
  type BudgetRepository,
  type BudgetValues,
} from '../../domain/repositories/budget.repository';

export interface BudgetMonthInput extends MonthRef {
  ownerId: number;
}

export interface MonthlyBudget extends BudgetValues {
  period: MonthRef;
  updatedAt: Date | null;
}

@Injectable()
export class GetBudgetUseCase {
  constructor(
    @Inject(BUDGET_REPOSITORY)
    private readonly budgetRepository: BudgetRepository,
  ) {}

  async execute(input: BudgetMonthInput): Promise<MonthlyBudget> {
    const period = { year: input.year, month: input.month };

    const stored = await this.budgetRepository.findByMonth(
      input.ownerId,
      firstDayOf(period),
    );

    return {
      period,
      totalLimit: stored?.totalLimit ?? null,
      categoryLimits: stored?.categoryLimits ?? [],
      updatedAt: stored?.updatedAt ?? null,
    };
  }
}
