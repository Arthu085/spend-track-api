import { Inject, Injectable } from '@nestjs/common';
import type { AccountEntity } from '@modules/accounts';
import { CreditCardInvoiceAssigner } from '@modules/credit-cards';
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
  occurrenceOfTransaction,
  type RecurrenceOccurrence,
} from './recurrence-occurrence';

export interface PlannedOccurrenceChanges {
  description: string;
  amount: number;
  category: TransactionCategoryEntity;
  account: AccountEntity | null;
  notes: string | null;
}

export interface OccurrenceSchedule {
  amount?: number;
  date?: string;
}

export type OwnedOccurrence =
  | { kind: 'transaction'; transaction: TransactionEntity }
  | { kind: 'cardCharge'; charge: RecurrenceCardChargeEntity };

export interface PaginatedOccurrences {
  items: RecurrenceOccurrence[];
  total: number;
}

@Injectable()
export class RecurrenceOccurrences {
  constructor(
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: TransactionRepository,
    @Inject(RECURRENCE_CARD_CHARGE_REPOSITORY)
    private readonly chargeRepository: RecurrenceCardChargeRepository,
    private readonly invoiceAssigner: CreditCardInvoiceAssigner,
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

    const state =
      occurrence.kind === 'transaction'
        ? occurrence.transaction.state
        : occurrence.charge.state;

    if (state !== TransactionState.PLANNED) {
      throw new RecurrenceOccurrenceNotPlannedError();
    }

    return occurrence;
  }

  async reschedule(
    recurrence: RecurrenceEntity,
    occurrence: OwnedOccurrence,
    schedule: OccurrenceSchedule,
  ): Promise<RecurrenceOccurrence> {
    if (occurrence.kind === 'transaction') {
      const { transaction } = occurrence;

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

  async cancel(occurrence: OwnedOccurrence): Promise<RecurrenceOccurrence> {
    return occurrence.kind === 'transaction'
      ? occurrenceOfTransaction(
          await this.transactionRepository.update(
            occurrence.transaction.cancel(),
          ),
        )
      : occurrenceOfCardCharge(
          await this.chargeRepository.update(occurrence.charge.cancel()),
        );
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
            category: changes.category,
          }),
        );
      }

      return;
    }

    for (const transaction of await this.plannedTransactions(
      recurrence,
      occurrenceFrom,
    )) {
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
