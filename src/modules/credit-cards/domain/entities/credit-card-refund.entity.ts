import { BaseEntity } from '@shared/domain/entities/base.entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { CreditCardRefundNotDeletableError } from '../errors/credit-card-refund-not-deletable.error';
import type { CreditCardInvoiceEntity } from './credit-card-invoice.entity';

export interface CreditCardPurchaseRef {
  id: number;
  uuid: string;
  description: string;
}

export interface CreateCreditCardRefundInput {
  uuid: string;
  ownerId: number;
  purchase: CreditCardPurchaseRef;
  invoice: CreditCardInvoiceEntity;
  amount: number;
  date: string;
  notes: string | null;
}

export interface ReconstituteCreditCardRefundInput extends CreateCreditCardRefundInput {
  id: number;
  status: RecordStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class CreditCardRefundEntity extends BaseEntity {
  private constructor(
    id: number,
    uuid: string,
    status: RecordStatus,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
    readonly ownerId: number,
    readonly purchase: CreditCardPurchaseRef,
    readonly invoice: CreditCardInvoiceEntity,
    readonly amount: number,
    readonly date: string,
    readonly notes: string | null,
  ) {
    super(id, uuid, status, createdAt, updatedAt, deletedAt);
  }

  static create(input: CreateCreditCardRefundInput): CreditCardRefundEntity {
    const now = new Date();

    return CreditCardRefundEntity.reconstitute({
      ...input,
      id: 0,
      status: RecordStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  static reconstitute(
    input: ReconstituteCreditCardRefundInput,
  ): CreditCardRefundEntity {
    return new CreditCardRefundEntity(
      input.id,
      input.uuid,
      input.status,
      input.createdAt,
      input.updatedAt,
      input.deletedAt,
      input.ownerId,
      input.purchase,
      input.invoice,
      input.amount,
      input.date,
      input.notes,
    );
  }

  assertDeletable(today: string): void {
    if (this.invoice.isClosedOn(today)) {
      throw new CreditCardRefundNotDeletableError();
    }
  }
}
