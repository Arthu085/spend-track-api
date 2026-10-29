import { BaseEntity } from '@shared/domain/entities/base.entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { AccountType } from '../enums/account-type.enum';

export interface AccountDetails {
  name: string;
  type: AccountType;
  openingBalance: number;
  openingBalanceDate: string;
}

export interface CreateAccountInput extends AccountDetails {
  uuid: string;
  ownerId: number;
  isDefault: boolean;
}

export interface ReconstituteAccountInput extends AccountDetails {
  id: number;
  uuid: string;
  status: RecordStatus;
  ownerId: number;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class AccountEntity extends BaseEntity {
  private constructor(
    id: number,
    uuid: string,
    status: RecordStatus,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
    readonly ownerId: number,
    readonly name: string,
    readonly type: AccountType,
    readonly openingBalance: number,
    readonly openingBalanceDate: string,
    readonly isDefault: boolean,
  ) {
    super(id, uuid, status, createdAt, updatedAt, deletedAt);
  }

  static create(input: CreateAccountInput): AccountEntity {
    const now = new Date();

    return AccountEntity.reconstitute({
      ...input,
      id: 0,
      status: RecordStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  static reconstitute(input: ReconstituteAccountInput): AccountEntity {
    return new AccountEntity(
      input.id,
      input.uuid,
      input.status,
      input.createdAt,
      input.updatedAt,
      input.deletedAt,
      input.ownerId,
      input.name,
      input.type,
      input.openingBalance,
      input.openingBalanceDate,
      input.isDefault,
    );
  }

  get currentBalance(): number {
    return this.openingBalance;
  }

  withDetails(details: AccountDetails): AccountEntity {
    return this.copyWith(details);
  }

  withDefault(isDefault: boolean): AccountEntity {
    return this.copyWith({ isDefault });
  }

  withStatus(status: RecordStatus): AccountEntity {
    return this.copyWith({
      status,
      isDefault: status === RecordStatus.ACTIVE && this.isDefault,
    });
  }

  private copyWith(
    changes: Partial<
      Pick<
        ReconstituteAccountInput,
        keyof AccountDetails | 'isDefault' | 'status'
      >
    >,
  ): AccountEntity {
    return AccountEntity.reconstitute({
      id: this.id,
      uuid: this.uuid,
      status: this.status,
      ownerId: this.ownerId,
      name: this.name,
      type: this.type,
      openingBalance: this.openingBalance,
      openingBalanceDate: this.openingBalanceDate,
      isDefault: this.isDefault,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      deletedAt: this.deletedAt,
      ...changes,
    });
  }
}
