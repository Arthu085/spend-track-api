import type { AccountEntity } from '@modules/accounts';
import type { CreditCardEntity } from '@modules/credit-cards';
import type { InvestmentEntity } from '@modules/investments';
import type { TransactionCategoryEntity } from '@modules/transaction-categories';
import { OccurrenceAfterRecurrenceEndError } from '@modules/transactions';
import {
  addDaysToDate,
  compareMonths,
  monthOf,
  type MonthRef,
} from '@shared/domain/calendar';
import { BaseEntity } from '@shared/domain/entities/base.entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { RecurrenceFrequency } from '../enums/recurrence-frequency.enum';
import { RecurrenceState } from '../enums/recurrence-state.enum';
import { RecurrenceType } from '../enums/recurrence-type.enum';
import { InvalidRecurrenceTargetError } from '../errors/invalid-recurrence-target.error';
import { InvalidSavingStrategyError } from '../errors/invalid-saving-strategy.error';
import { RecurrenceCategoryKindMismatchError } from '../errors/recurrence-category-kind-mismatch.error';
import { RecurrenceEndBeforeStartError } from '../errors/recurrence-end-before-start.error';
import { RecurrenceEndedError } from '../errors/recurrence-ended.error';
import { RecurrenceStateTransitionError } from '../errors/recurrence-state-transition.error';
import type { SavingStrategy } from '../saving-plan/saving-plan';
import {
  firstScheduleDateFrom,
  scheduleDates,
} from '../schedule/recurrence-schedule';

export interface RecurrenceDetails {
  description: string;
  amount: number;
  category: TransactionCategoryEntity | null;
  account: AccountEntity | null;
  notes: string | null;
  savingStrategy: SavingStrategy | null;
}

export interface CreateRecurrenceInput extends RecurrenceDetails {
  uuid: string;
  ownerId: number;
  type: RecurrenceType;
  frequency: RecurrenceFrequency;
  startDate: string;
  endDate: string | null;
  creditCard: CreditCardEntity | null;
  investment: InvestmentEntity | null;
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
    readonly category: TransactionCategoryEntity | null,
    readonly notes: string | null,
    readonly generatedThrough: string | null,
    readonly investment: InvestmentEntity | null,
    readonly savingStrategy: SavingStrategy | null,
  ) {
    super(id, uuid, status, createdAt, updatedAt, deletedAt);
  }

  static create(input: CreateRecurrenceInput): RecurrenceEntity {
    RecurrenceEntity.assertTarget(input);
    RecurrenceEntity.assertCategory(input.type, input.category);
    RecurrenceEntity.assertSavingStrategy(
      input.type,
      input.frequency,
      input.savingStrategy,
    );

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
      input.investment,
      input.savingStrategy,
    );
  }

  private static assertTarget(
    input: Pick<
      CreateRecurrenceInput,
      'type' | 'account' | 'creditCard' | 'investment'
    >,
  ): void {
    if ((input.account === null) === (input.creditCard === null)) {
      throw new InvalidRecurrenceTargetError();
    }

    if (input.creditCard !== null && input.type !== RecurrenceType.EXPENSE) {
      throw new InvalidRecurrenceTargetError();
    }

    const contributes = input.type === RecurrenceType.INVESTMENT_CONTRIBUTION;

    if (
      contributes !== (input.investment !== null) ||
      (contributes && input.account === null)
    ) {
      throw new InvalidRecurrenceTargetError();
    }
  }

  private static assertCategory(
    type: RecurrenceType,
    category: TransactionCategoryEntity | null,
  ): void {
    const expected = type === RecurrenceType.INVESTMENT_CONTRIBUTION;

    if (expected !== (category === null)) {
      throw new RecurrenceCategoryKindMismatchError();
    }

    if (category !== null && String(category.kind) !== String(type)) {
      throw new RecurrenceCategoryKindMismatchError();
    }
  }

  private static assertSavingStrategy(
    type: RecurrenceType,
    frequency: RecurrenceFrequency,
    strategy: SavingStrategy | null,
  ): void {
    if (strategy === null) {
      return;
    }

    if (
      type !== RecurrenceType.INVESTMENT_CONTRIBUTION ||
      frequency !== RecurrenceFrequency.MONTHLY ||
      strategy.minimumRetainedBalance < 0
    ) {
      throw new InvalidSavingStrategyError();
    }
  }

  get isCardRecurrence(): boolean {
    return this.creditCard !== null;
  }

  get isInvestmentContribution(): boolean {
    return this.type === RecurrenceType.INVESTMENT_CONTRIBUTION;
  }

  categoryOrFail(): TransactionCategoryEntity {
    if (!this.category) {
      throw new Error('Investment contribution recurrences have no category');
    }

    return this.category;
  }

  stateOn(today: string): RecurrenceState {
    if (this.endDate !== null && this.endDate < today) {
      return RecurrenceState.ENDED;
    }

    return this.state;
  }

  isScheduledInMonth(month: MonthRef): boolean {
    return (
      compareMonths(month, monthOf(this.startDate)) >= 0 &&
      (this.endDate === null ||
        compareMonths(month, monthOf(this.endDate)) <= 0)
    );
  }

  nextOccurrenceDate(today: string): string | null {
    if (this.stateOn(today) !== RecurrenceState.ACTIVE) {
      return null;
    }

    const opening = this.account?.openingBalanceDate ?? today;

    const next = firstScheduleDateFrom(
      this.startDate,
      this.frequency,
      [today, this.startDate, opening].reduce((latest, date) =>
        date > latest ? date : latest,
      ),
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
      investment: this.investment,
    });
    RecurrenceEntity.assertCategory(this.type, details.category);
    RecurrenceEntity.assertSavingStrategy(
      this.type,
      this.frequency,
      details.savingStrategy,
    );

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

    if (cut === null) {
      return this.copyWith({
        state: RecurrenceState.ENDED,
        endDate: today < this.startDate ? this.endDate : this.endingBy(today),
      });
    }

    if (cut <= this.startDate) {
      return this.copyWith({ state: RecurrenceState.ENDED });
    }

    return this.copyWith({ endDate: this.endingBy(addDaysToDate(cut, -1)) });
  }

  assertOccurrenceWithinEnd(date: string): void {
    if (this.endDate !== null && date > this.endDate) {
      throw new OccurrenceAfterRecurrenceEndError();
    }
  }

  private endingBy(date: string): string {
    return this.endDate !== null && this.endDate < date ? this.endDate : date;
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
      investment: this.investment,
      category: this.category,
      notes: this.notes,
      savingStrategy: this.savingStrategy,
      generatedThrough: this.generatedThrough,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      deletedAt: this.deletedAt,
      ...changes,
    });
  }
}
