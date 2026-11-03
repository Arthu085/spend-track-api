import { BaseEntity } from '@shared/domain/entities/base.entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import type { BillingDays } from '../billing/invoice-cycle';

export interface CreditCardDetails extends BillingDays {
  name: string;
  creditLimit: number;
}

export interface CreateCreditCardInput extends CreditCardDetails {
  uuid: string;
  ownerId: number;
  isDefault: boolean;
}

export interface ReconstituteCreditCardInput extends CreditCardDetails {
  id: number;
  uuid: string;
  status: RecordStatus;
  ownerId: number;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class CreditCardEntity extends BaseEntity implements BillingDays {
  private constructor(
    id: number,
    uuid: string,
    status: RecordStatus,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
    readonly ownerId: number,
    readonly name: string,
    readonly creditLimit: number,
    readonly closingDay: number,
    readonly dueDay: number,
    readonly isDefault: boolean,
  ) {
    super(id, uuid, status, createdAt, updatedAt, deletedAt);
  }

  static create(input: CreateCreditCardInput): CreditCardEntity {
    const now = new Date();

    return CreditCardEntity.reconstitute({
      ...input,
      id: 0,
      status: RecordStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  static reconstitute(input: ReconstituteCreditCardInput): CreditCardEntity {
    return new CreditCardEntity(
      input.id,
      input.uuid,
      input.status,
      input.createdAt,
      input.updatedAt,
      input.deletedAt,
      input.ownerId,
      input.name,
      input.creditLimit,
      input.closingDay,
      input.dueDay,
      input.isDefault,
    );
  }

  withDetails(details: CreditCardDetails): CreditCardEntity {
    return this.copyWith(details);
  }

  withDefault(isDefault: boolean): CreditCardEntity {
    return this.copyWith({ isDefault });
  }

  withStatus(status: RecordStatus): CreditCardEntity {
    return this.copyWith({
      status,
      isDefault: status === RecordStatus.ACTIVE && this.isDefault,
    });
  }

  private copyWith(
    changes: Partial<
      Pick<
        ReconstituteCreditCardInput,
        keyof CreditCardDetails | 'isDefault' | 'status'
      >
    >,
  ): CreditCardEntity {
    return CreditCardEntity.reconstitute({
      id: this.id,
      uuid: this.uuid,
      status: this.status,
      ownerId: this.ownerId,
      name: this.name,
      creditLimit: this.creditLimit,
      closingDay: this.closingDay,
      dueDay: this.dueDay,
      isDefault: this.isDefault,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      deletedAt: this.deletedAt,
      ...changes,
    });
  }
}
