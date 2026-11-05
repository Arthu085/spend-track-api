import { Inject, Injectable } from '@nestjs/common';
import {
  ACCOUNT_LEDGERS,
  withCurrentBalances,
  type AccountEntity,
  type AccountLedger,
} from '@modules/accounts';
import {
  CreditCardStatements,
  statementsDueInMonth,
} from '@modules/credit-cards';
import {
  INVESTMENT_MOVEMENT_REPOSITORY,
  type InvestmentEntity,
  type InvestmentMovementEntity,
  type InvestmentMovementRepository,
} from '@modules/investments';
import {
  TRANSACTION_REPOSITORY,
  TransactionState,
  type TransactionRepository,
} from '@modules/transactions';
import {
  compareMonths,
  firstDayOf,
  lastDayOf,
  monthOf,
  type MonthRef,
} from '@shared/domain/calendar';
import { sumMoney } from '@shared/domain/money';
import { isRecordUsable } from '@shared/domain/policies';
import type { RecurrenceEntity } from '../../domain/entities/recurrence.entity';
import { RecurrenceState } from '../../domain/enums/recurrence-state.enum';
import {
  RECURRENCE_CARD_CHARGE_REPOSITORY,
  type RecurrenceCardChargeRepository,
} from '../../domain/repositories/recurrence-card-charge.repository';
import {
  RECURRENCE_REPOSITORY,
  type RecurrenceRepository,
} from '../../domain/repositories/recurrence.repository';
import {
  savingPlanOf,
  type SavingPlanFigures,
  type SavingStrategy,
} from '../../domain/saving-plan/saving-plan';

export interface SavingPlanOccurrence {
  uuid: string;
  date: string;
  amount: number;
  overdue: boolean;
}

export interface SavingPlan extends SavingPlanFigures {
  recurrence: RecurrenceEntity;
  state: RecurrenceState;
  investment: InvestmentEntity;
  account: AccountEntity;
  strategy: SavingStrategy;
  month: string;
  actualBalance: number;
  plannedTransactions: number;
  cardObligations: number;
  mandatory: {
    planned: number;
    completed: number;
    plannedOccurrences: SavingPlanOccurrence[];
  };
  additional: InvestmentMovementEntity | null;
}

interface PlannableRecurrence {
  recurrence: RecurrenceEntity;
  investment: InvestmentEntity;
  account: AccountEntity;
  strategy: SavingStrategy;
}

function plannableOf(recurrence: RecurrenceEntity): PlannableRecurrence | null {
  const { investment, account, savingStrategy: strategy } = recurrence;

  return investment && account && strategy
    ? { recurrence, investment, account, strategy }
    : null;
}

function isListed(
  { recurrence, investment, account }: PlannableRecurrence,
  month: MonthRef,
  today: string,
): boolean {
  return (
    recurrence.stateOn(today) === RecurrenceState.ACTIVE &&
    recurrence.isScheduledInMonth(month) &&
    isRecordUsable(investment) &&
    isRecordUsable(account)
  );
}

@Injectable()
export class SavingPlans {
  constructor(
    @Inject(RECURRENCE_REPOSITORY)
    private readonly recurrenceRepository: RecurrenceRepository,
    @Inject(ACCOUNT_LEDGERS)
    private readonly accountLedger: AccountLedger,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: TransactionRepository,
    @Inject(INVESTMENT_MOVEMENT_REPOSITORY)
    private readonly movementRepository: InvestmentMovementRepository,
    @Inject(RECURRENCE_CARD_CHARGE_REPOSITORY)
    private readonly chargeRepository: RecurrenceCardChargeRepository,
    private readonly creditCardStatements: CreditCardStatements,
  ) {}

  async forMonth(
    ownerId: number,
    month: MonthRef,
    today: string,
    knownCardObligations?: number,
  ): Promise<SavingPlan[]> {
    const recurrences =
      await this.recurrenceRepository.findWithSavingStrategyByOwner(ownerId);

    return this.plansOf(
      ownerId,
      recurrences
        .map(plannableOf)
        .filter((plannable): plannable is PlannableRecurrence =>
          plannable === null ? false : isListed(plannable, month, today),
        ),
      month,
      today,
      knownCardObligations,
    );
  }

  async forRecurrence(
    recurrence: RecurrenceEntity,
    month: MonthRef,
    today: string,
  ): Promise<SavingPlan> {
    const plannable = plannableOf(recurrence);

    if (!plannable) {
      throw new Error('Only recurrences with a saving strategy have a plan');
    }

    const [plan] = await this.plansOf(
      recurrence.ownerId,
      [plannable],
      month,
      today,
    );

    return plan;
  }

  private async plansOf(
    ownerId: number,
    plannables: readonly PlannableRecurrence[],
    month: MonthRef,
    today: string,
    knownCardObligations?: number,
  ): Promise<SavingPlan[]> {
    if (plannables.length === 0) {
      return [];
    }

    const start = firstDayOf(month);
    const end = lastDayOf(month);
    const monthClosed = compareMonths(month, monthOf(today)) < 0;
    const recurrenceIds = plannables.map(({ recurrence }) => recurrence.id);

    const accounts = await withCurrentBalances(this.accountLedger, ownerId, [
      ...new Map(
        plannables.map(({ account }) => [account.id, account]),
      ).values(),
    ]);

    const accountIds = accounts.map((account) => account.id);
    const plannedFilter = { state: TransactionState.PLANNED, until: end };

    const plannedTransactions =
      await this.transactionRepository.sumBalanceChanges(
        ownerId,
        accountIds,
        plannedFilter,
      );

    const plannedMovements = await this.movementRepository.sumAccountChanges(
      ownerId,
      accountIds,
      plannedFilter,
    );

    const ownPlanned =
      await this.movementRepository.findPlannedMandatoryThrough(
        ownerId,
        recurrenceIds,
        end,
      );

    const completed =
      await this.movementRepository.sumCompletedMandatoryByRecurrence(
        ownerId,
        recurrenceIds,
        { from: start, to: end },
      );

    const additional = new Map(
      (
        await this.movementRepository.findLiveAdditionalByMonth(
          ownerId,
          recurrenceIds,
          start,
        )
      ).map((movement) => [movement.recurrence?.id, movement]),
    );

    const cardObligations =
      knownCardObligations ?? (await this.cardObligations(ownerId, start));

    const balances = new Map(
      accounts.map((account) => [account.id, account.currentBalance]),
    );

    return plannables.map(({ recurrence, investment, account, strategy }) => {
      const occurrences = ownPlanned.filter(
        (movement) =>
          movement.recurrence?.id === recurrence.id &&
          movement.account?.id === account.id,
      );

      const ownPlannedMandatory = sumMoney(
        occurrences.map((movement) => movement.amount),
      );

      const actualBalance = balances.get(account.id) ?? 0;
      const plannedTransactionsTotal = plannedTransactions.get(account.id) ?? 0;
      const live = additional.get(recurrence.id) ?? null;

      return {
        ...savingPlanOf({
          strategy,
          actualBalance,
          plannedTransactions: plannedTransactionsTotal,
          plannedMovements: plannedMovements.get(account.id) ?? 0,
          ownPlannedMandatory,
          cardObligations,
          monthClosed,
          hasLiveAdditional: live !== null,
        }),
        recurrence,
        state: recurrence.stateOn(today),
        investment,
        account,
        strategy,
        month: start,
        actualBalance,
        plannedTransactions: plannedTransactionsTotal,
        cardObligations,
        mandatory: {
          planned: ownPlannedMandatory,
          completed: completed.get(recurrence.id) ?? 0,
          plannedOccurrences: occurrences.map((movement) => ({
            uuid: movement.uuid,
            date: movement.date,
            amount: movement.amount,
            overdue: movement.date < today,
          })),
        },
        additional: live,
      };
    });
  }

  private async cardObligations(
    ownerId: number,
    monthStart: string,
  ): Promise<number> {
    const statements = await this.creditCardStatements.forOwner(ownerId);

    const plannedDue = await this.chargeRepository.findPlannedDueThrough(
      ownerId,
      monthStart,
      1,
    );

    const outstanding = sumMoney(
      statementsDueInMonth(statements, monthStart).map(
        ({ outstanding: due }) => due,
      ),
    );

    return outstanding + plannedDue.total;
  }
}
