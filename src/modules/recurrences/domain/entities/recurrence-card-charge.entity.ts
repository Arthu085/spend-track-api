import type { TransactionCategoryEntity } from '@modules/transaction-categories';
import { TransactionState } from '@modules/transactions';
import { BaseEntity } from '@shared/domain/entities/base.entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { RecurrenceOccurrenceNotPlannedError } from '../errors/recurrence-occurrence-not-planned.error';

export interface RecurrenceCardChargeDetails {
  description: string;
  amount: number;
  category: TransactionCategoryEntity;
}

export interface RecurrenceCardChargeSchedule {
  amount: number;
  date: string;
  invoiceMonth: string;
}

export interface RecurrenceCardChargePurchase {
  id: number;
  uuid: string;
}

export interface CreateRecurrenceCardChargeInput extends RecurrenceCardChargeDetails {
  uuid: string;
  ownerId: number;
  recurrenceId: number;
  occurrenceDate: string;
  invoiceMonth: string;
}

export interface ReconstituteRecurrenceCardChargeInput extends CreateRecurrenceCardChargeInput {
  id: number;
  status: RecordStatus;
  date: string;
  state: TransactionState;
  canceledAt: Date | null;
  purchase: RecurrenceCardChargePurchase | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class RecurrenceCardChargeEntity extends BaseEntity {
  private constructor(
    id: number,
    uuid: string,
    status: RecordStatus,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
    readonly ownerId: number,
    readonly recurrenceId: number,
    readonly occurrenceDate: string,
    readonly date: string,
    readonly description: string,
    readonly amount: number,
    readonly category: TransactionCategoryEntity,
    readonly invoiceMonth: string,
    readonly state: TransactionState,
    readonly canceledAt: Date | null,
    readonly purchase: RecurrenceCardChargePurchase | null,
  ) {
    super(id, uuid, status, createdAt, updatedAt, deletedAt);
  }

  static create(
    input: CreateRecurrenceCardChargeInput,
  ): RecurrenceCardChargeEntity {
    const now = new Date();

    return RecurrenceCardChargeEntity.reconstitute({
      ...input,
      id: 0,
      status: RecordStatus.ACTIVE,
      date: input.occurrenceDate,
      state: TransactionState.PLANNED,
      canceledAt: null,
      purchase: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  static reconstitute(
    input: ReconstituteRecurrenceCardChargeInput,
  ): RecurrenceCardChargeEntity {
    return new RecurrenceCardChargeEntity(
      input.id,
      input.uuid,
      input.status,
      input.createdAt,
      input.updatedAt,
      input.deletedAt,
      input.ownerId,
      input.recurrenceId,
      input.occurrenceDate,
      input.date,
      input.description,
      input.amount,
      input.category,
      input.invoiceMonth,
      input.state,
      input.canceledAt,
      input.purchase,
    );
  }

  assertPlanned(): void {
    if (this.state !== TransactionState.PLANNED) {
      throw new RecurrenceOccurrenceNotPlannedError();
    }
  }

  withDetails(
    details: RecurrenceCardChargeDetails,
  ): RecurrenceCardChargeEntity {
    this.assertPlanned();

    return this.copyWith(details);
  }

  rescheduled(
    schedule: RecurrenceCardChargeSchedule,
  ): RecurrenceCardChargeEntity {
    this.assertPlanned();

    return this.copyWith(schedule);
  }

  complete(
    purchase: RecurrenceCardChargePurchase,
    schedule: RecurrenceCardChargeSchedule,
  ): RecurrenceCardChargeEntity {
    this.assertPlanned();

    return this.copyWith({
      ...schedule,
      state: TransactionState.COMPLETED,
      purchase,
    });
  }

  cancel(): RecurrenceCardChargeEntity {
    this.assertPlanned();

    return this.copyWith({
      state: TransactionState.CANCELED,
      canceledAt: new Date(),
    });
  }

  private copyWith(
    changes: Partial<
      Pick<
        ReconstituteRecurrenceCardChargeInput,
        | keyof RecurrenceCardChargeDetails
        | keyof RecurrenceCardChargeSchedule
        | 'state'
        | 'canceledAt'
        | 'purchase'
      >
    >,
  ): RecurrenceCardChargeEntity {
    return RecurrenceCardChargeEntity.reconstitute({
      id: this.id,
      uuid: this.uuid,
      status: this.status,
      ownerId: this.ownerId,
      recurrenceId: this.recurrenceId,
      occurrenceDate: this.occurrenceDate,
      date: this.date,
      description: this.description,
      amount: this.amount,
      category: this.category,
      invoiceMonth: this.invoiceMonth,
      state: this.state,
      canceledAt: this.canceledAt,
      purchase: this.purchase,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      deletedAt: this.deletedAt,
      ...changes,
    });
  }
}
