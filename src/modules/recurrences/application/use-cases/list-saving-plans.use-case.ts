import { Injectable } from '@nestjs/common';
import { financeToday } from '@shared/domain/calendar';
import { SavingPlans, type SavingPlan } from '../services/saving-plans';

export interface ListSavingPlansInput {
  ownerId: number;
  year: number;
  month: number;
}

@Injectable()
export class ListSavingPlansUseCase {
  constructor(private readonly savingPlans: SavingPlans) {}

  execute(input: ListSavingPlansInput): Promise<SavingPlan[]> {
    return this.savingPlans.forMonth(
      input.ownerId,
      { year: input.year, month: input.month },
      financeToday(),
    );
  }
}
