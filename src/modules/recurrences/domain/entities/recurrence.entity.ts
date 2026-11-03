import type { AccountEntity } from '@modules/accounts';
import type { CreditCardEntity } from '@modules/credit-cards';
import type { TransactionCategoryEntity } from '@modules/transaction-categories';
import { addDaysToDate } from '@shared/domain/calendar';
import { BaseEntity } from '@shared/domain/entities/base.entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { RecurrenceFrequency } from '../enums/recurrence-frequency.enum';
import { RecurrenceState } from '../enums/recurrence-state.enum';
import { RecurrenceType } from '../enums/recurrence-type.enum';
import { InvalidRecurrenceTargetError } from '../errors/invalid-recurrence-target.error';
import { RecurrenceCategoryKindMismatchError } from '../errors/recurrence-category-kind-mismatch.error';
import { RecurrenceEndBeforeStartError } from '../errors/recurrence-end-before-start.error';
import { RecurrenceEndedError } from '../errors/recurrence-ended.error';
import { RecurrenceStateTransitionError } from '../errors/recurrence-state-transition.error';
import {
  firstScheduleDateFrom,
  scheduleDates,
} from '../schedule/recurrence-schedule';

export interface RecurrenceDetails {
  description: string;
  amount: number;
  category: TransactionCategoryEntity;
  account: AccountEntity | null;
  notes: string | null;
}

export interface CreateRecurrenceInput extends RecurrenceDetails {
  uuid: string;
  ownerId: number;
  type: RecurrenceType;
  frequency: RecurrenceFrequency;
  startDate: string;
  endDate: string | null;
  creditCard: CreditCardEntity | null;
}

export interface ReconstituteRecurrenceInput extends CreateRecurrenceInput {
  id: number;
  status: RecordStatus;
  state: RecurrenceState;
  generatedThrough: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class RecurrenceEntity extends BaseEntity {
  private constructor(
    id: number,
    uuid: string,
    status: RecordStatus,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
    readonly ownerId: number,
    readonly type: RecurrenceType,
    readonly description: string,
    readonly amount: number,
    readonly frequency: RecurrenceFrequency,
    readonly startDate: string,
    readonly endDate: string | null,
    readonly state: RecurrenceState,
    readonly account: AccountEntity | null,
    readonly creditCard: CreditCardEntity | null,
    readonly category: TransactionCategoryEntity,
    readonly notes: string | null,
    readonly generatedThrough: string | null,
  ) {
    super(id, uuid, status, createdAt, updatedAt, deletedAt);
  }

  static create(input: CreateRecurrenceInput): RecurrenceEntity {
    RecurrenceEntity.assertTarget(input);
    RecurrenceEntity.assertCategory(input.type, input.category);

    if (input.endDate !== null && input.endDate < input.startDate) {
      throw new RecurrenceEndBeforeStartError();
    }

    const now = new Date();

    return RecurrenceEntity.reconstitute({
      ...input,
      id: 0,
      status: RecordStatus.ACTIVE,
      state: RecurrenceState.ACTIVE,
      generatedThrough: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  static reconstitute(input: ReconstituteRecurrenceInput): RecurrenceEntity {
    return new RecurrenceEntity(
      input.id,
      input.uuid,
      input.status,
      input.createdAt,
      input.updatedAt,
      input.deletedAt,
      input.ownerId,
      input.type,
      input.description,
      input.amount,
      input.frequency,
      input.startDate,
      input.endDate,
      input.state,
      input.account,
      input.creditCard,
      input.category,
      input.notes,
      input.generatedThrough,
    );
  }

  private static assertTarget(
    input: Pick<CreateRecurrenceInput, 'type' | 'account' | 'creditCard'>,
  ): void {
    if ((input.account === null) === (input.creditCard === null)) {
      throw new InvalidRecurrenceTargetError();
    }

    if (input.creditCard !== null && input.type !== RecurrenceType.EXPENSE) {
      throw new InvalidRecurrenceTargetError();
    }
  }

  private static assertCategory(
    type: RecurrenceType,
    category: TransactionCategoryEntity,
  ): void {
    if (String(category.kind) !== String(type)) {
      throw new RecurrenceCategoryKindMismatchError();
    }
  }

  get isCardRecurrence(): boolean {
    return this.creditCard !== null;
  }

  stateOn(today: string): RecurrenceState {
    if (this.endDate !== null && this.endDate < today) {
      return RecurrenceState.ENDED;
    }

    return this.state;
  }

  nextOccurrenceDate(today: string): string | null {
    if (this.stateOn(today) !== RecurrenceState.ACTIVE) {
      return null;
    }

    const next = firstScheduleDateFrom(
      this.startDate,
      this.frequency,
      today > this.startDate ? today : this.startDate,
    );

    return this.endDate !== null && next > this.endDate ? null : next;
  }

  datesToGenerate(through: string): string[] {
    if (this.state !== RecurrenceState.ACTIVE) {
      return [];
    }

    const until =
      this.endDate !== null && this.endDate < through ? this.endDate : through;

    return scheduleDates(this.startDate, this.frequency, {
      after: this.generatedThrough,
      until,
    });
  }

  generatedUntil(through: string): RecurrenceEntity {
    if (this.generatedThrough !== null && this.generatedThrough >= through) {
      return this;
    }

    return this.copyWith({ generatedThrough: through });
  }

  assertChangeable(today: string): void {
    if (this.stateOn(today) === RecurrenceState.ENDED) {
      throw new RecurrenceEndedError();
    }
  }

  withDetails(details: RecurrenceDetails): RecurrenceEntity {
    RecurrenceEntity.assertTarget({
      type: this.type,
      account: details.account,
      creditCard: this.creditCard,
    });
    RecurrenceEntity.assertCategory(this.type, details.category);

    return this.copyWith(details);
  }

  pause(today: string): RecurrenceEntity {
    this.assertChangeable(today);

    if (this.state !== RecurrenceState.ACTIVE) {
      throw new RecurrenceStateTransitionError();
    }

    return this.copyWith({
      state: RecurrenceState.PAUSED,
      generatedThrough: addDaysToDate(today, -1),
    });
  }

  resume(today: string): RecurrenceEntity {
    this.assertChangeable(today);

    if (this.state !== RecurrenceState.PAUSED) {
      throw new RecurrenceStateTransitionError();
    }

    const yesterday = addDaysToDate(today, -1);

    return this.copyWith({
      state: RecurrenceState.ACTIVE,
      generatedThrough:
        this.generatedThrough !== null && this.generatedThrough > yesterday
          ? this.generatedThrough
          : yesterday,
    });
  }

  endBefore(cut: string | null, today: string): RecurrenceEntity {
    this.assertChangeable(today);

    if (cut === null || cut <= this.startDate) {
      return this.copyWith({ state: RecurrenceState.ENDED });
    }

    const endDate = addDaysToDate(cut, -1);

    return this.copyWith({
      endDate:
        this.endDate !== null && this.endDate < endDate
          ? this.endDate
          : endDate,
    });
  }

  private copyWith(
    changes: Partial<
      Pick<
        ReconstituteRecurrenceInput,
        keyof RecurrenceDetails | 'state' | 'endDate' | 'generatedThrough'
      >
    >,
  ): RecurrenceEntity {
    return RecurrenceEntity.reconstitute({
      id: this.id,
      uuid: this.uuid,
      status: this.status,
      ownerId: this.ownerId,
      type: this.type,
      description: this.description,
      amount: this.amount,
      frequency: this.frequency,
      startDate: this.startDate,
      endDate: this.endDate,
      state: this.state,
      account: this.account,
      creditCard: this.creditCard,
      category: this.category,
      notes: this.notes,
      generatedThrough: this.generatedThrough,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      deletedAt: this.deletedAt,
      ...changes,
    });
  }
}
