import type { AccountEntity } from '@modules/accounts';
import type { TransactionCategoryEntity } from '@modules/transaction-categories';
import { BaseEntity } from '@shared/domain/entities/base.entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { TransactionState } from '../enums/transaction-state.enum';
import { TransactionType } from '../enums/transaction-type.enum';
import { TransactionNotDeletableError } from '../errors/transaction-not-deletable.error';
import { TransactionNotEditableError } from '../errors/transaction-not-editable.error';
import { TransactionStateTransitionError } from '../errors/transaction-state-transition.error';
import { assertTransactionReferences } from '../policies/assert-transaction-references.policy';

export interface TransactionDetails {
  description: string;
  amount: number;
  date: string;
  account: AccountEntity;
  destinationAccount: AccountEntity | null;
  category: TransactionCategoryEntity | null;
  notes: string | null;
}

export interface CreateTransactionInput extends TransactionDetails {
  uuid: string;
  ownerId: number;
  type: TransactionType;
  state: TransactionState.PLANNED | TransactionState.COMPLETED;
  completedOn: string | null;
}

export interface ReconstituteTransactionInput extends TransactionDetails {
  id: number;
  uuid: string;
  status: RecordStatus;
  ownerId: number;
  type: TransactionType;
  state: TransactionState;
  completedOn: string | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface TransactionFinancialChanges {
  amount?: number;
  date?: string;
  accountUuid?: string;
  destinationAccountUuid?: string;
}

export class TransactionEntity extends BaseEntity {
  private constructor(
    id: number,
    uuid: string,
    status: RecordStatus,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
    readonly ownerId: number,
    readonly type: TransactionType,
    readonly description: string,
    readonly amount: number,
    readonly date: string,
    readonly state: TransactionState,
    readonly completedOn: string | null,
    readonly canceledAt: Date | null,
    readonly account: AccountEntity,
    readonly destinationAccount: AccountEntity | null,
    readonly category: TransactionCategoryEntity | null,
    readonly notes: string | null,
  ) {
    super(id, uuid, status, createdAt, updatedAt, deletedAt);
  }

  static create(input: CreateTransactionInput): TransactionEntity {
    assertTransactionReferences(input);

    const now = new Date();

    return TransactionEntity.reconstitute({
      ...input,
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

  static reconstitute(input: ReconstituteTransactionInput): TransactionEntity {
    return new TransactionEntity(
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
      input.date,
      input.state,
      input.completedOn,
      input.canceledAt,
      input.account,
      input.destinationAccount,
      input.category,
      input.notes,
    );
  }

  assertEditable(changes: TransactionFinancialChanges): void {
    if (this.state === TransactionState.CANCELED) {
      throw new TransactionNotEditableError();
    }

    if (
      this.state === TransactionState.COMPLETED &&
      this.changesFinancialFields(changes)
    ) {
      throw new TransactionNotEditableError();
    }
  }

  withDetails(details: TransactionDetails): TransactionEntity {
    assertTransactionReferences({ ...details, type: this.type });

    return this.copyWith(details);
  }

  complete(completedOn: string): TransactionEntity {
    if (this.state !== TransactionState.PLANNED) {
      throw new TransactionStateTransitionError();
    }

    return this.copyWith({ state: TransactionState.COMPLETED, completedOn });
  }

  cancel(): TransactionEntity {
    if (this.state === TransactionState.CANCELED) {
      throw new TransactionStateTransitionError();
    }

    return this.copyWith({
      state: TransactionState.CANCELED,
      canceledAt: new Date(),
    });
  }

  assertDeletable(): void {
    if (this.state !== TransactionState.PLANNED) {
      throw new TransactionNotDeletableError();
    }
  }

  private changesFinancialFields(
    changes: TransactionFinancialChanges,
  ): boolean {
    const differs = <T>(sent: T | undefined, current: T): boolean =>
      sent !== undefined && sent !== current;

    return (
      differs(changes.amount, this.amount) ||
      differs(changes.date, this.date) ||
      differs(changes.accountUuid, this.account.uuid) ||
      differs(changes.destinationAccountUuid, this.destinationAccount?.uuid)
    );
  }

  private copyWith(
    changes: Partial<
      Pick<
        ReconstituteTransactionInput,
        keyof TransactionDetails | 'state' | 'completedOn' | 'canceledAt'
      >
    >,
  ): TransactionEntity {
    return TransactionEntity.reconstitute({
      id: this.id,
      uuid: this.uuid,
      status: this.status,
      ownerId: this.ownerId,
      type: this.type,
      description: this.description,
      amount: this.amount,
      date: this.date,
      state: this.state,
      completedOn: this.completedOn,
      canceledAt: this.canceledAt,
      account: this.account,
      destinationAccount: this.destinationAccount,
      category: this.category,
      notes: this.notes,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      deletedAt: this.deletedAt,
      ...changes,
    });
  }
}
