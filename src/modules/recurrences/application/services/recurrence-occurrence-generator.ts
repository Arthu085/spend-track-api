import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  CreditCardInvoiceAssigner,
  type CreditCardEntity,
} from '@modules/credit-cards';
import {
  INVESTMENT_MOVEMENT_REPOSITORY,
  InvestmentMovementEntity,
  type InvestmentMovementRepository,
} from '@modules/investments';
import {
  TRANSACTION_REPOSITORY,
  TransactionEntity,
  TransactionState,
  TransactionType,
  type TransactionRepository,
} from '@modules/transactions';
import { lastDayOf, monthOf, shiftMonth } from '@shared/domain/calendar';
import { isRecordUsable } from '@shared/domain/policies';
import { RecurrenceCardChargeEntity } from '../../domain/entities/recurrence-card-charge.entity';
import type { RecurrenceEntity } from '../../domain/entities/recurrence.entity';
import { RecurrenceState } from '../../domain/enums/recurrence-state.enum';
import { RecurrenceType } from '../../domain/enums/recurrence-type.enum';
import {
  RECURRENCE_CARD_CHARGE_REPOSITORY,
  type RecurrenceCardChargeRepository,
} from '../../domain/repositories/recurrence-card-charge.repository';
import {
  RECURRENCE_REPOSITORY,
  type RecurrenceRepository,
} from '../../domain/repositories/recurrence.repository';

export const GENERATION_HORIZON_MONTHS = 12;

export function generationHorizon(today: string): string {
  return lastDayOf(shiftMonth(monthOf(today), GENERATION_HORIZON_MONTHS));
}

@Injectable()
export class RecurrenceOccurrenceGenerator {
  constructor(
    @Inject(RECURRENCE_REPOSITORY)
    private readonly recurrenceRepository: RecurrenceRepository,
    @Inject(RECURRENCE_CARD_CHARGE_REPOSITORY)
    private readonly chargeRepository: RecurrenceCardChargeRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: TransactionRepository,
    private readonly invoiceAssigner: CreditCardInvoiceAssigner,
    @Inject(INVESTMENT_MOVEMENT_REPOSITORY)
    private readonly movementRepository: InvestmentMovementRepository,
  ) {}

  async generate(
    recurrence: RecurrenceEntity,
    today: string,
  ): Promise<RecurrenceEntity> {
    if (
      recurrence.stateOn(today) !== RecurrenceState.ACTIVE ||
      !this.targetAvailable(recurrence)
    ) {
      return recurrence;
    }

    const horizon = generationHorizon(today);

    for (const date of await this.missingDates(recurrence, horizon)) {
      await this.createOccurrence(recurrence, date);
    }

    const through =
      recurrence.endDate !== null && recurrence.endDate < horizon
        ? recurrence.endDate
        : horizon;

    return this.recurrenceRepository.update(recurrence.generatedUntil(through));
  }

  private async missingDates(
    recurrence: RecurrenceEntity,
    horizon: string,
  ): Promise<string[]> {
    const opening = recurrence.account?.openingBalanceDate;

    const dates = recurrence
      .datesToGenerate(horizon)
      .filter((date) => opening === undefined || date >= opening);

    if (dates.length === 0) {
      return [];
    }

    const existing = new Set(await this.existingDates(recurrence, dates[0]));

    return dates.filter((date) => !existing.has(date));
  }

  private existingDates(
    recurrence: RecurrenceEntity,
    from: string,
  ): Promise<string[]> {
    if (recurrence.isCardRecurrence) {
      return this.chargeRepository.findOccurrenceDatesFrom(recurrence.id, from);
    }

    if (recurrence.isInvestmentContribution) {
      return this.movementRepository.findMandatoryDatesFrom(
        recurrence.ownerId,
        recurrence.id,
        from,
      );
    }

    return this.transactionRepository.findRecurrenceDatesFrom(
      recurrence.ownerId,
      recurrence.id,
      from,
    );
  }

  private targetAvailable(recurrence: RecurrenceEntity): boolean {
    const target = recurrence.account ?? recurrence.creditCard;

    return (
      isRecordUsable(target) &&
      (!recurrence.isInvestmentContribution ||
        isRecordUsable(recurrence.investment))
    );
  }

  private async createOccurrence(
    recurrence: RecurrenceEntity,
    date: string,
  ): Promise<void> {
    if (recurrence.creditCard) {
      await this.createCardCharge(recurrence, recurrence.creditCard, date);

      return;
    }

    if (!recurrence.account) {
      throw new Error('Recurrence must have an account or a card');
    }

    if (recurrence.investment) {
      await this.movementRepository.create(
        InvestmentMovementEntity.createMandatoryContribution({
          uuid: randomUUID(),
          ownerId: recurrence.ownerId,
          investmentId: recurrence.investment.id,
          account: recurrence.account,
          amount: recurrence.amount,
          date,
          recurrence: { id: recurrence.id, uuid: recurrence.uuid },
        }),
      );

      return;
    }

    await this.transactionRepository.create(
      TransactionEntity.create({
        uuid: randomUUID(),
        ownerId: recurrence.ownerId,
        type:
          recurrence.type === RecurrenceType.INCOME
            ? TransactionType.INCOME
            : TransactionType.EXPENSE,
        state: TransactionState.PLANNED,
        completedOn: null,
        description: recurrence.description,
        amount: recurrence.amount,
        date,
        account: recurrence.account,
        destinationAccount: null,
        category: recurrence.categoryOrFail(),
        notes: recurrence.notes,
        recurrence: {
          id: recurrence.id,
          uuid: recurrence.uuid,
          occurrenceDate: date,
          endDate: recurrence.endDate,
        },
      }),
    );
  }

  private async createCardCharge(
    recurrence: RecurrenceEntity,
    card: CreditCardEntity,
    date: string,
  ): Promise<void> {
    await this.chargeRepository.create(
      RecurrenceCardChargeEntity.create({
        uuid: randomUUID(),
        ownerId: recurrence.ownerId,
        recurrenceId: recurrence.id,
        occurrenceDate: date,
        description: recurrence.description,
        amount: recurrence.amount,
        category: recurrence.categoryOrFail(),
        invoiceMonth: await this.invoiceAssigner.referenceMonthFor(card, date),
      }),
    );
  }
}
