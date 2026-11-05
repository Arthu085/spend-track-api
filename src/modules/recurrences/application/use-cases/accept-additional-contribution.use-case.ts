import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  InactiveAccountError,
  assertNotBeforeOpening,
  type AccountEntity,
} from '@modules/accounts';
import {
  AdditionalContributionAlreadyExistsError,
  InactiveInvestmentError,
  INVESTMENT_MOVEMENT_REPOSITORY,
  InvestmentMovementEntity,
  type InvestmentEntity,
  type InvestmentMovementRepository,
} from '@modules/investments';
import { TransactionState } from '@modules/transactions';
import {
  TRANSACTION_MANAGER,
  type TransactionManagerPort,
} from '@shared/application/ports';
import {
  compareMonths,
  financeToday,
  firstDayOf,
  lastDayOf,
  monthOf,
  type MonthRef,
} from '@shared/domain/calendar';
import { isRecordUsable } from '@shared/domain/policies';
import type { RecurrenceEntity } from '../../domain/entities/recurrence.entity';
import { AdditionalContributionStrategy } from '../../domain/enums/additional-contribution-strategy.enum';
import { RecurrenceState } from '../../domain/enums/recurrence-state.enum';
import { AdditionalContributionOutsideMonthError } from '../../domain/errors/additional-contribution-outside-month.error';
import { CompletedAdditionalContributionInFutureError } from '../../domain/errors/completed-additional-contribution-in-future.error';
import { SavingPlanMonthClosedError } from '../../domain/errors/saving-plan-month-closed.error';
import { SavingPlanNotActiveError } from '../../domain/errors/saving-plan-not-active.error';
import { RecurrenceReferences } from '../services/recurrence-references';
import { SavingPlans } from '../services/saving-plans';

export interface AcceptAdditionalContributionInput {
  uuid: string;
  ownerId: number;
  year: number;
  month: number;
  amount: number;
  date?: string;
  state: TransactionState.PLANNED | TransactionState.COMPLETED;
}

@Injectable()
export class AcceptAdditionalContributionUseCase {
  constructor(
    @Inject(INVESTMENT_MOVEMENT_REPOSITORY)
    private readonly movementRepository: InvestmentMovementRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    private readonly references: RecurrenceReferences,
    private readonly savingPlans: SavingPlans,
  ) {}

  async execute(
    input: AcceptAdditionalContributionInput,
  ): Promise<InvestmentMovementEntity> {
    return this.transactionManager.runInTransaction(async () => {
      await this.references.lockOwnerFinances(input.ownerId);

      const recurrence = await this.references.lockRecurrence(
        input.uuid,
        input.ownerId,
      );

      const today = financeToday();
      const month: MonthRef = { year: input.year, month: input.month };

      const { investment, account } = this.activeTargets(
        recurrence,
        month,
        today,
      );

      if (compareMonths(month, monthOf(today)) < 0) {
        throw new SavingPlanMonthClosedError();
      }

      const date = this.dateIn(month, input.date, today);

      if (input.state === TransactionState.COMPLETED && date > today) {
        throw new CompletedAdditionalContributionInFutureError();
      }

      assertNotBeforeOpening([account], [date]);

      const plan = await this.savingPlans.forRecurrence(
        recurrence,
        month,
        today,
      );

      if (plan.additional) {
        throw new AdditionalContributionAlreadyExistsError();
      }

      return this.movementRepository.create(
        InvestmentMovementEntity.createAdditionalContribution({
          uuid: randomUUID(),
          ownerId: input.ownerId,
          investmentId: investment.id,
          account,
          amount: input.amount,
          date,
          state: input.state,
          recurrence: { id: recurrence.id, uuid: recurrence.uuid },
          surplusMonth: plan.month,
          suggestedAmount: plan.suggestedAdditional,
          retainedMinimum: plan.strategy.minimumRetainedBalance,
        }),
      );
    });
  }

  private activeTargets(
    recurrence: RecurrenceEntity,
    month: MonthRef,
    today: string,
  ): { investment: InvestmentEntity; account: AccountEntity } {
    const { investment, account, savingStrategy } = recurrence;

    if (
      !investment ||
      !account ||
      savingStrategy?.additionalContribution !==
        AdditionalContributionStrategy.REMAINING_SURPLUS ||
      recurrence.stateOn(today) !== RecurrenceState.ACTIVE ||
      !recurrence.isScheduledInMonth(month)
    ) {
      throw new SavingPlanNotActiveError();
    }

    if (!isRecordUsable(investment)) {
      throw new InactiveInvestmentError();
    }

    if (!isRecordUsable(account)) {
      throw new InactiveAccountError();
    }

    return { investment, account };
  }

  private dateIn(
    month: MonthRef,
    requested: string | undefined,
    today: string,
  ): string {
    const first = firstDayOf(month);
    const last = lastDayOf(month);

    if (requested === undefined) {
      return today >= first && today <= last ? today : first;
    }

    if (requested < first || requested > last) {
      throw new AdditionalContributionOutsideMonthError();
    }

    return requested;
  }
}
