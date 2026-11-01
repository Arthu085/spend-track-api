import type { AccountEntity } from '@modules/accounts';
import { BaseEntity } from '@shared/domain/entities/base.entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { CreditCardPaymentAlreadyCanceledError } from '../errors/credit-card-payment-already-canceled.error';
import type { CreditCardInvoiceEntity } from './credit-card-invoice.entity';

export interface CreateCreditCardPaymentInput {
  uuid: string;
  ownerId: number;
  invoice: CreditCardInvoiceEntity;
  account: AccountEntity;
  amount: number;
  paidOn: string;
}

export interface ReconstituteCreditCardPaymentInput extends CreateCreditCardPaymentInput {
  id: number;
  status: RecordStatus;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class CreditCardPaymentEntity extends BaseEntity {
  private constructor(
    id: number,
    uuid: string,
    status: RecordStatus,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
    readonly ownerId: number,
    readonly invoice: CreditCardInvoiceEntity,
    readonly account: AccountEntity,
    readonly amount: number,
    readonly paidOn: string,
    readonly canceledAt: Date | null,
  ) {
    super(id, uuid, status, createdAt, updatedAt, deletedAt);
  }

  static create(input: CreateCreditCardPaymentInput): CreditCardPaymentEntity {
    const now = new Date();

    return CreditCardPaymentEntity.reconstitute({
      ...input,
      id: 0,
      status: RecordStatus.ACTIVE,
      canceledAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  static reconstitute(
    input: ReconstituteCreditCardPaymentInput,
  ): CreditCardPaymentEntity {
    return new CreditCardPaymentEntity(
      input.id,
      input.uuid,
      input.status,
      input.createdAt,
      input.updatedAt,
      input.deletedAt,
      input.ownerId,
      input.invoice,
      input.account,
      input.amount,
      input.paidOn,
      input.canceledAt,
    );
  }

  cancel(): CreditCardPaymentEntity {
    if (this.canceledAt !== null) {
      throw new CreditCardPaymentAlreadyCanceledError();
    }

    const now = new Date();

    return CreditCardPaymentEntity.reconstitute({
      id: this.id,
      uuid: this.uuid,
      status: this.status,
      ownerId: this.ownerId,
      invoice: this.invoice,
      account: this.account,
      amount: this.amount,
      paidOn: this.paidOn,
      canceledAt: now,
      createdAt: this.createdAt,
      updatedAt: now,
      deletedAt: this.deletedAt,
    });
  }
}
