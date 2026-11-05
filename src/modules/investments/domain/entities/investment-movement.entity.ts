import type { AccountEntity } from '@modules/accounts';
import { TransactionState } from '@modules/transactions';
import { BaseEntity } from '@shared/domain/entities/base.entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { ContributionKind } from '../enums/contribution-kind.enum';
import { InvestmentMovementType } from '../enums/investment-movement-type.enum';
import { InvestmentMovementStateTransitionError } from '../errors/investment-movement-state-transition.error';

export interface InvestmentMovementRecurrenceLink {
  id: number;
  uuid: string;
  occurrenceDate: string | null;
}

export interface CreateTransferMovementInput {
  uuid: string;
  ownerId: number;
  investmentId: number;
  type: InvestmentMovementType.CONTRIBUTION | InvestmentMovementType.WITHDRAWAL;
  account: AccountEntity;
  amount: number;
  date: string;
  state: TransactionState.PLANNED | TransactionState.COMPLETED;
  completedOn: string | null;
}

export interface CreateValuationMovementInput {
  uuid: string;
  ownerId: number;
  investmentId: number;
  change: number;
  date: string;
}

export interface CreateMandatoryContributionInput {
  uuid: string;
  ownerId: number;
  investmentId: number;
  account: AccountEntity;
  amount: number;
  date: string;
  recurrence: { id: number; uuid: string };
}

export interface CreateAdditionalContributionInput {
  uuid: string;
  ownerId: number;
  investmentId: number;
  account: AccountEntity;
  amount: number;
  date: string;
  state: TransactionState.PLANNED | TransactionState.COMPLETED;
  recurrence: { id: number; uuid: string };
  surplusMonth: string;
  suggestedAmount: number;
  retainedMinimum: number;
}

export interface PlannedMovementDetails {
  amount: number;
  date: string;
  account: AccountEntity;
}

export interface MovementContributionFields {
  contributionKind: ContributionKind;
  recurrence: InvestmentMovementRecurrenceLink | null;
  surplusMonth: string | null;
  suggestedAmount: number | null;
  retainedMinimum: number | null;
}

const ONE_TIME_FIELDS: MovementContributionFields = {
  contributionKind: ContributionKind.ONE_TIME,
  recurrence: null,
  surplusMonth: null,
  suggestedAmount: null,
  retainedMinimum: null,
};

export interface ReconstituteInvestmentMovementInput extends MovementContributionFields {
  id: number;
  uuid: string;
  status: RecordStatus;
  ownerId: number;
  investmentId: number;
  type: InvestmentMovementType;
  account: AccountEntity | null;
  amount: number;
  date: string;
  state: TransactionState;
  completedOn: string | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class InvestmentMovementEntity extends BaseEntity {
  private constructor(
    id: number,
    uuid: string,
    status: RecordStatus,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
    readonly ownerId: number,
    readonly investmentId: number,
    readonly type: InvestmentMovementType,
    readonly account: AccountEntity | null,
    readonly amount: number,
    readonly date: string,
    readonly state: TransactionState,
    readonly completedOn: string | null,
    readonly canceledAt: Date | null,
    readonly contributionKind: ContributionKind,
    readonly recurrence: InvestmentMovementRecurrenceLink | null,
    readonly surplusMonth: string | null,
    readonly suggestedAmount: number | null,
    readonly retainedMinimum: number | null,
  ) {
    super(id, uuid, status, createdAt, updatedAt, deletedAt);
  }

  static createTransfer(
    input: CreateTransferMovementInput,
  ): InvestmentMovementEntity {
    const now = new Date();

    return InvestmentMovementEntity.reconstitute({
      ...input,
      ...ONE_TIME_FIELDS,
      id: 0,
      status: RecordStatus.ACTIVE,
      completedOn:
        input.state === TransactionState.COMPLETED
          ? (input.completedOn ?? input.date)
          : null,
      canceledAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  static createValuation(
    input: CreateValuationMovementInput,
  ): InvestmentMovementEntity {
    const now = new Date();

    return InvestmentMovementEntity.reconstitute({
      id: 0,
      uuid: input.uuid,
      status: RecordStatus.ACTIVE,
      ownerId: input.ownerId,
      investmentId: input.investmentId,
      ...ONE_TIME_FIELDS,
      type: InvestmentMovementType.VALUATION,
      account: null,
      amount: input.change,
      date: input.date,
      state: TransactionState.COMPLETED,
      completedOn: input.date,
      canceledAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  static createMandatoryContribution(
    input: CreateMandatoryContributionInput,
  ): InvestmentMovementEntity {
    const now = new Date();

    return InvestmentMovementEntity.reconstitute({
      ...input,
      ...ONE_TIME_FIELDS,
      id: 0,
      status: RecordStatus.ACTIVE,
      type: InvestmentMovementType.CONTRIBUTION,
      state: TransactionState.PLANNED,
      completedOn: null,
      canceledAt: null,
      contributionKind: ContributionKind.MANDATORY,
      recurrence: { ...input.recurrence, occurrenceDate: input.date },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  static createAdditionalContribution(
    input: CreateAdditionalContributionInput,
  ): InvestmentMovementEntity {
    const now = new Date();

    return InvestmentMovementEntity.reconstitute({
      ...input,
      id: 0,
      status: RecordStatus.ACTIVE,
      type: InvestmentMovementType.CONTRIBUTION,
      completedOn:
        input.state === TransactionState.COMPLETED ? input.date : null,
      canceledAt: null,
      contributionKind: ContributionKind.ADDITIONAL,
      recurrence: { ...input.recurrence, occurrenceDate: null },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  static reconstitute(
    input: ReconstituteInvestmentMovementInput,
  ): InvestmentMovementEntity {
    return new InvestmentMovementEntity(
      input.id,
      input.uuid,
      input.status,
      input.createdAt,
      input.updatedAt,
      input.deletedAt,
      input.ownerId,
      input.investmentId,
      input.type,
      input.account,
      input.amount,
      input.date,
      input.state,
      input.completedOn,
      input.canceledAt,
      input.contributionKind,
      input.recurrence,
      input.surplusMonth,
      input.suggestedAmount,
      input.retainedMinimum,
    );
  }

  get valueChange(): number {
    if (this.state !== TransactionState.COMPLETED) {
      return 0;
    }

    return this.type === InvestmentMovementType.WITHDRAWAL
      ? -this.amount
      : this.amount;
  }

  withPlannedDetails(
    details: PlannedMovementDetails,
  ): InvestmentMovementEntity {
    if (this.state !== TransactionState.PLANNED) {
      throw new InvestmentMovementStateTransitionError();
    }

    return this.copyWith(details);
  }

  complete(completedOn: string): InvestmentMovementEntity {
    if (this.state !== TransactionState.PLANNED) {
      throw new InvestmentMovementStateTransitionError();
    }

    return this.copyWith({ state: TransactionState.COMPLETED, completedOn });
  }

  cancel(): InvestmentMovementEntity {
    if (this.state === TransactionState.CANCELED) {
      throw new InvestmentMovementStateTransitionError();
    }

    return this.copyWith({
      state: TransactionState.CANCELED,
      canceledAt: new Date(),
    });
  }

  private copyWith(
    changes: Partial<
      Pick<
        ReconstituteInvestmentMovementInput,
        'state' | 'completedOn' | 'canceledAt' | keyof PlannedMovementDetails
      >
    >,
  ): InvestmentMovementEntity {
    return InvestmentMovementEntity.reconstitute({
      id: this.id,
      uuid: this.uuid,
      status: this.status,
      ownerId: this.ownerId,
      investmentId: this.investmentId,
      type: this.type,
      account: this.account,
      amount: this.amount,
      date: this.date,
      state: this.state,
      completedOn: this.completedOn,
      canceledAt: this.canceledAt,
      contributionKind: this.contributionKind,
      recurrence: this.recurrence,
      surplusMonth: this.surplusMonth,
      suggestedAmount: this.suggestedAmount,
      retainedMinimum: this.retainedMinimum,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      deletedAt: this.deletedAt,
      ...changes,
    });
  }
}
