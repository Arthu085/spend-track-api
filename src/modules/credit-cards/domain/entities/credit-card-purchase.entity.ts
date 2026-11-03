import type { TransactionCategoryEntity } from '@modules/transaction-categories';
import { BaseEntity } from '@shared/domain/entities/base.entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { sumMoney } from '@shared/domain/money';
import { CreditCardPurchaseNotDeletableError } from '../errors/credit-card-purchase-not-deletable.error';
import { CreditCardRefundBeforePurchaseError } from '../errors/credit-card-refund-before-purchase.error';
import { CreditCardRefundExceedsPurchaseError } from '../errors/credit-card-refund-exceeds-purchase.error';
import type { CreditCardInvoiceEntity } from './credit-card-invoice.entity';
import type { CreditCardEntity } from './credit-card.entity';

export interface CreditCardInstallment {
  number: number;
  amount: number;
  date: string;
  invoice: CreditCardInvoiceEntity;
}

export interface CreditCardPurchaseRefund {
  uuid: string;
  amount: number;
  date: string;
  invoice: CreditCardInvoiceEntity;
}

export interface CreditCardPurchaseDetails {
  description: string;
  category: TransactionCategoryEntity;
  notes: string | null;
}

export interface CreateCreditCardPurchaseInput extends CreditCardPurchaseDetails {
  uuid: string;
  ownerId: number;
  card: CreditCardEntity;
  amount: number;
  purchaseDate: string;
  installments: CreditCardInstallment[];
}

export interface ReconstituteCreditCardPurchaseInput extends CreateCreditCardPurchaseInput {
  id: number;
  status: RecordStatus;
  refunds: CreditCardPurchaseRefund[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class CreditCardPurchaseEntity extends BaseEntity {
  private constructor(
    id: number,
    uuid: string,
    status: RecordStatus,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
    readonly ownerId: number,
    readonly card: CreditCardEntity,
    readonly category: TransactionCategoryEntity,
    readonly description: string,
    readonly amount: number,
    readonly purchaseDate: string,
    readonly notes: string | null,
    readonly installments: readonly CreditCardInstallment[],
    readonly refunds: readonly CreditCardPurchaseRefund[],
  ) {
    super(id, uuid, status, createdAt, updatedAt, deletedAt);
  }

  static create(
    input: CreateCreditCardPurchaseInput,
  ): CreditCardPurchaseEntity {
    const now = new Date();

    return CreditCardPurchaseEntity.reconstitute({
      ...input,
      id: 0,
      status: RecordStatus.ACTIVE,
      refunds: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  static reconstitute(
    input: ReconstituteCreditCardPurchaseInput,
  ): CreditCardPurchaseEntity {
    return new CreditCardPurchaseEntity(
      input.id,
      input.uuid,
      input.status,
      input.createdAt,
      input.updatedAt,
      input.deletedAt,
      input.ownerId,
      input.card,
      input.category,
      input.description,
      input.amount,
      input.purchaseDate,
      input.notes,
      [...input.installments].sort((left, right) => left.number - right.number),
      input.refunds,
    );
  }

  get installmentCount(): number {
    return this.installments.length;
  }

  get refundedAmount(): number {
    return sumMoney(this.refunds.map((refund) => refund.amount));
  }

  get refundableAmount(): number {
    return this.amount - this.refundedAmount;
  }

  assertRefundable(amount: number, date: string): void {
    if (date < this.purchaseDate) {
      throw new CreditCardRefundBeforePurchaseError();
    }

    if (amount > this.refundableAmount) {
      throw new CreditCardRefundExceedsPurchaseError();
    }
  }

  isDeletableOn(today: string): boolean {
    return (
      this.refunds.length === 0 &&
      this.installments.every(({ invoice }) => !invoice.isClosedOn(today))
    );
  }

  assertDeletable(today: string): void {
    if (!this.isDeletableOn(today)) {
      throw new CreditCardPurchaseNotDeletableError();
    }
  }

  withDetails(details: CreditCardPurchaseDetails): CreditCardPurchaseEntity {
    return CreditCardPurchaseEntity.reconstitute({
      id: this.id,
      uuid: this.uuid,
      status: this.status,
      ownerId: this.ownerId,
      card: this.card,
      amount: this.amount,
      purchaseDate: this.purchaseDate,
      installments: [...this.installments],
      refunds: [...this.refunds],
      createdAt: this.createdAt,
      updatedAt: new Date(),
      deletedAt: this.deletedAt,
      ...details,
    });
  }
}
