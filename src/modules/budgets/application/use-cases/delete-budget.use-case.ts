import { Inject, Injectable } from '@nestjs/common';
import { firstDayOf } from '@shared/domain/calendar';
import { BudgetNotFoundError } from '../../domain/errors/budget-not-found.error';
import {
  BUDGET_REPOSITORY,
  type BudgetRepository,
} from '../../domain/repositories/budget.repository';
import type { BudgetMonthInput } from './get-budget.use-case';

@Injectable()
export class DeleteBudgetUseCase {
  constructor(
    @Inject(BUDGET_REPOSITORY)
    private readonly budgetRepository: BudgetRepository,
  ) {}

  async execute(input: BudgetMonthInput): Promise<void> {
    const deleted = await this.budgetRepository.delete(
      input.ownerId,
      firstDayOf({ year: input.year, month: input.month }),
    );

    if (!deleted) {
      throw new BudgetNotFoundError();
    }
  }
}
