import { Inject, Injectable } from '@nestjs/common';
import { assertNotBeforeOpening, type AccountEntity } from '@modules/accounts';
import { CreditCardInvoiceAssigner } from '@modules/credit-cards';
import {
  INVESTMENT_MOVEMENT_REPOSITORY,
  type InvestmentMovementEntity,
  type InvestmentMovementRepository,
} from '@modules/investments';
import type { TransactionCategoryEntity } from '@modules/transaction-categories';
import {
  TRANSACTION_REPOSITORY,
  TransactionState,
  type RecurrenceOccurrenceFilters,
  type TransactionEntity,
  type TransactionRepository,
} from '@modules/transactions';
import type { RecurrenceCardChargeEntity } from '../../domain/entities/recurrence-card-charge.entity';
import type { RecurrenceEntity } from '../../domain/entities/recurrence.entity';
import { RecurrenceOccurrenceNotFoundError } from '../../domain/errors/recurrence-occurrence-not-found.error';
import { RecurrenceOccurrenceNotPlannedError } from '../../domain/errors/recurrence-occurrence-not-planned.error';
import {
  RECURRENCE_CARD_CHARGE_REPOSITORY,
  type RecurrenceCardChargeRepository,
} from '../../domain/repositories/recurrence-card-charge.repository';
import {
  occurrenceOfCardCharge,
  occurrenceOfMovement,
  occurrenceOfTransaction,
  type RecurrenceOccurrence,
} from './recurrence-occurrence';

export interface PlannedOccurrenceChanges {
  description: string;
  amount: number;
  category: TransactionCategoryEntity | null;
  account: AccountEntity | null;
  notes: string | null;
}

export interface PlannedMovementChanges {
  amount?: number;
  account?: AccountEntity | null;
}

export interface OccurrenceSchedule {
  amount?: number;
  date?: string;
}

export type OwnedOccurrence =
  | { kind: 'transaction'; transaction: TransactionEntity }
  | { kind: 'cardCharge'; charge: RecurrenceCardChargeEntity }
  | { kind: 'movement'; movement: InvestmentMovementEntity };

export interface PaginatedOccurrences {
  items: RecurrenceOccurrence[];
  total: number;
}

function plannableOf(occurrence: OwnedOccurrence): {
  state: TransactionState;
  date: string;
} {
  switch (occurrence.kind) {
    case 'transaction':
      return occurrence.transaction;
    case 'cardCharge':
      return occurrence.charge;
    case 'movement':
      return occurrence.movement;
  }
}

@Injectable()
export class RecurrenceOccurrences {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: TransactionRepository,
    @Inject(RECURRENCE_CARD_CHARGE_REPOSITORY)
    private readonly chargeRepository: RecurrenceCardChargeRepository,
    private readonly invoiceAssigner: CreditCardInvoiceAssigner,
    @Inject(INVESTMENT_MOVEMENT_REPOSITORY)
    private readonly movementRepository: InvestmentMovementRepository,
  ) {}

  async list(
    recurrence: RecurrenceEntity,
    offset: number,
    limit: number,
    filters: RecurrenceOccurrenceFilters,
  ): Promise<PaginatedOccurrences> {
    if (recurrence.isCardRecurrence) {
      const { items, total } =
        await this.chargeRepository.findPaginatedByRecurrence(
          recurrence.id,
          offset,
          limit,
          filters,
        );

      return { items: items.map(occurrenceOfCardCharge), total };
    }

    if (recurrence.isInvestmentContribution) {
      const { items, total } =
        await this.movementRepository.findPaginatedMandatoryByRecurrence(
          recurrence.ownerId,
          recurrence.id,
          offset,
          limit,
          filters,
        );

      return {
        items: items.map((movement) =>
          occurrenceOfMovement(movement, recurrence.description),
        ),
        total,
      };
    }

    const { items, total } =
      await this.transactionRepository.findPaginatedByRecurrence(
        recurrence.ownerId,
        recurrence.id,
        offset,
        limit,
        filters,
      );

    return { items: items.map(occurrenceOfTransaction), total };
  }

  async lockPlanned(
    recurrence: RecurrenceEntity,
    uuid: string,
  ): Promise<OwnedOccurrence> {
    const occurrence = await this.lock(recurrence, uuid);

    if (plannableOf(occurrence).state !== TransactionState.PLANNED) {
      throw new RecurrenceOccurrenceNotPlannedError();
    }

    return occurrence;
  }

  async reschedule(
    recurrence: RecurrenceEntity,
    occurrence: OwnedOccurrence,
    schedule: OccurrenceSchedule,
  ): Promise<RecurrenceOccurrence> {
    const currentDate = plannableOf(occurrence).date;

    if (schedule.date !== undefined && schedule.date !== currentDate) {
      recurrence.assertOccurrenceWithinEnd(schedule.date);
    }

    if (occurrence.kind === 'transaction') {
      const { transaction } = occurrence;

      if (schedule.date !== undefined && schedule.date !== transaction.date) {
        assertNotBeforeOpening([transaction.account], [schedule.date]);
      }

      return occurrenceOfTransaction(
        await this.transactionRepository.update(
          transaction.withDetails({
            description: transaction.description,
            amount: schedule.amount ?? transaction.amount,
            date: schedule.date ?? transaction.date,
            account: transaction.account,
            destinationAccount: transaction.destinationAccount,
            category: transaction.category,
            notes: transaction.notes,
          }),
        ),
      );
    }

    if (occurrence.kind === 'movement') {
      return this.rescheduleMovement(recurrence, occurrence.movement, schedule);
    }

    const { charge } = occurrence;
    const date = schedule.date ?? charge.date;

    return occurrenceOfCardCharge(
      await this.chargeRepository.update(
        charge.rescheduled({
          amount: schedule.amount ?? charge.amount,
          date,
          invoiceMonth: await this.cardInvoiceMonth(recurrence, date),
        }),
      ),
    );
  }

  async cancel(
    recurrence: RecurrenceEntity,
    occurrence: OwnedOccurrence,
  ): Promise<RecurrenceOccurrence> {
    switch (occurrence.kind) {
      case 'transaction':
        return occurrenceOfTransaction(
          await this.transactionRepository.update(
            occurrence.transaction.cancel(),
          ),
        );
      case 'cardCharge':
        return occurrenceOfCardCharge(
          await this.chargeRepository.update(occurrence.charge.cancel()),
        );
      case 'movement':
        return occurrenceOfMovement(
          await this.movementRepository.update(occurrence.movement.cancel()),
          recurrence.description,
        );
    }
  }

  async updatePlanned(
    recurrence: RecurrenceEntity,
    occurrenceFrom: string | undefined,
    changes: PlannedOccurrenceChanges,
  ): Promise<void> {
    if (recurrence.isCardRecurrence) {
      for (const charge of await this.chargeRepository.findPlannedByRecurrence(
        recurrence.id,
        occurrenceFrom,
      )) {
        await this.chargeRepository.update(
          charge.withDetails({
            description: changes.description,
            amount: changes.amount,
            category: recurrence.categoryOrFail(),
          }),
        );
      }

      return;
    }

    for (const transaction of await this.plannedTransactions(
      recurrence,
      occurrenceFrom,
    )) {
      if (changes.account && changes.account.id !== transaction.account.id) {
        assertNotBeforeOpening([changes.account], [transaction.date]);
      }

      await this.transactionRepository.update(
        transaction.withDetails({
          description: changes.description,
          amount: changes.amount,
          date: transaction.date,
          account: changes.account ?? transaction.account,
          destinationAccount: null,
          category: changes.category,
          notes: changes.notes,
        }),
      );
    }
  }

  async updatePlannedMovements(
    recurrence: RecurrenceEntity,
    occurrenceFrom: string | undefined,
    changes: PlannedMovementChanges,
  ): Promise<void> {
    if (changes.amount === undefined && !changes.account) {
      return;
    }

    for (const movement of await this.movementRepository.findPlannedMandatoryByRecurrence(
      recurrence.ownerId,
      recurrence.id,
      occurrenceFrom,
    )) {
      const account = changes.account ?? movement.account;

      if (!account) {
        throw new Error('Contributions have an account');
      }

      if (account.id !== movement.account?.id) {
        assertNotBeforeOpening([account], [movement.date]);
      }

      await this.movementRepository.update(
        movement.withPlannedDetails({
          amount: changes.amount ?? movement.amount,
          date: movement.date,
          account,
        }),
      );
    }
  }

  async removePlanned(
    recurrence: RecurrenceEntity,
    occurrenceFrom?: string,
  ): Promise<void> {
    if (recurrence.isCardRecurrence) {
      for (const charge of await this.chargeRepository.findPlannedByRecurrence(
        recurrence.id,
        occurrenceFrom,
      )) {
        await this.chargeRepository.softDelete(charge);
      }

      return;
    }

    if (recurrence.isInvestmentContribution) {
      for (const movement of await this.movementRepository.findPlannedMandatoryByRecurrence(
        recurrence.ownerId,
        recurrence.id,
        occurrenceFrom,
      )) {
        await this.movementRepository.softDelete(movement);
      }

      return;
    }

    for (const transaction of await this.plannedTransactions(
      recurrence,
      occurrenceFrom,
    )) {
      await this.transactionRepository.softDelete(transaction);
    }
  }

  async cardInvoiceMonth(
    recurrence: RecurrenceEntity,
    date: string,
  ): Promise<string> {
    if (!recurrence.creditCard) {
      throw new Error('Only card recurrences have invoice months');
    }

    return this.invoiceAssigner.referenceMonthFor(recurrence.creditCard, date);
  }

  private async lock(
    recurrence: RecurrenceEntity,
    uuid: string,
  ): Promise<OwnedOccurrence> {
    if (recurrence.isCardRecurrence) {
      const charge = await this.chargeRepository.findByUuidForRecurrence(
        uuid,
        recurrence.id,
      );

      if (!charge) {
        throw new RecurrenceOccurrenceNotFoundError();
      }

      return { kind: 'cardCharge', charge };
    }

    if (recurrence.isInvestmentContribution) {
      const movement =
        await this.movementRepository.findMandatoryByUuidForRecurrence(
          uuid,
          recurrence.id,
        );

      if (!movement) {
        throw new RecurrenceOccurrenceNotFoundError();
      }

      return { kind: 'movement', movement };
    }

    const transaction =
      await this.transactionRepository.findByUuidForOwnerForUpdate(
        uuid,
        recurrence.ownerId,
      );

    if (!transaction || transaction.recurrence?.id !== recurrence.id) {
      throw new RecurrenceOccurrenceNotFoundError();
    }

    return { kind: 'transaction', transaction };
  }

  private async rescheduleMovement(
    recurrence: RecurrenceEntity,
    movement: InvestmentMovementEntity,
    schedule: OccurrenceSchedule,
  ): Promise<RecurrenceOccurrence> {
    if (!movement.account) {
      throw new Error('Contributions have an account');
    }

    if (schedule.date !== undefined && schedule.date !== movement.date) {
      assertNotBeforeOpening([movement.account], [schedule.date]);
    }

    return occurrenceOfMovement(
      await this.movementRepository.update(
        movement.withPlannedDetails({
          amount: schedule.amount ?? movement.amount,
          date: schedule.date ?? movement.date,
          account: movement.account,
        }),
      ),
      recurrence.description,
    );
  }

  private plannedTransactions(
    recurrence: RecurrenceEntity,
    occurrenceFrom: string | undefined,
  ): Promise<TransactionEntity[]> {
    return this.transactionRepository.findPlannedByRecurrence(
      recurrence.ownerId,
      recurrence.id,
      occurrenceFrom,
    );
  }
}
