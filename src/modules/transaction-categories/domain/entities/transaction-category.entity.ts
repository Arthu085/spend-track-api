import { BaseEntity } from '@shared/domain/entities/base.entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { TransactionCategoryKind } from '../enums/transaction-category-kind.enum';
import { TransactionCategoryScope } from '../enums/transaction-category-scope.enum';

export interface TransactionCategoryDetails {
  name: string;
  color: string | null;
}

export interface CreatePersonalTransactionCategoryInput extends TransactionCategoryDetails {
  uuid: string;
  ownerId: number;
  kind: TransactionCategoryKind;
}

export interface ReconstituteTransactionCategoryInput extends TransactionCategoryDetails {
  id: number;
  uuid: string;
  status: RecordStatus;
  ownerId: number | null;
  code: string | null;
  kind: TransactionCategoryKind;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class TransactionCategoryEntity extends BaseEntity {
  private constructor(
    id: number,
    uuid: string,
    status: RecordStatus,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
    readonly ownerId: number | null,
    readonly code: string | null,
    readonly name: string,
    readonly kind: TransactionCategoryKind,
    readonly color: string | null,
  ) {
    super(id, uuid, status, createdAt, updatedAt, deletedAt);
  }

  static createPersonal(
    input: CreatePersonalTransactionCategoryInput,
  ): TransactionCategoryEntity {
    const now = new Date();

    return TransactionCategoryEntity.reconstitute({
      ...input,
      id: 0,
      status: RecordStatus.ACTIVE,
      code: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  static reconstitute(
    input: ReconstituteTransactionCategoryInput,
  ): TransactionCategoryEntity {
    return new TransactionCategoryEntity(
      input.id,
      input.uuid,
      input.status,
      input.createdAt,
      input.updatedAt,
      input.deletedAt,
      input.ownerId,
      input.code,
      input.name,
      input.kind,
      input.color,
    );
  }

  get scope(): TransactionCategoryScope {
    return this.ownerId === null
      ? TransactionCategoryScope.GLOBAL
      : TransactionCategoryScope.PERSONAL;
  }

  withDetails(details: TransactionCategoryDetails): TransactionCategoryEntity {
    return this.copyWith(details);
  }

  withStatus(status: RecordStatus): TransactionCategoryEntity {
    return this.copyWith({ status });
  }

  private copyWith(
    changes: Partial<
      Pick<ReconstituteTransactionCategoryInput, 'name' | 'color' | 'status'>
    >,
  ): TransactionCategoryEntity {
    return TransactionCategoryEntity.reconstitute({
      id: this.id,
      uuid: this.uuid,
      status: this.status,
      ownerId: this.ownerId,
      code: this.code,
      name: this.name,
      kind: this.kind,
      color: this.color,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      deletedAt: this.deletedAt,
      ...changes,
    });
  }
}
