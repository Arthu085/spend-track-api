import type { TransactionCategoryEntity } from '@modules/transaction-categories';
import type { InvoiceTotals } from '../billing/invoice-statement';
import { CreditCardInvoiceEntity } from '../entities/credit-card-invoice.entity';
import type { CreditCardPaymentEntity } from '../entities/credit-card-payment.entity';
import type { CreditCardRefundEntity } from '../entities/credit-card-refund.entity';

export const CREDIT_CARD_INVOICE_REPOSITORY = Symbol(
  'CREDIT_CARD_INVOICE_REPOSITORY',
);

export interface InvoiceTotalsFilter {
  cardIds?: readonly number[];
}

export interface InvoiceCharge {
  purchaseUuid: string;
  description: string;
  category: TransactionCategoryEntity;
  purchaseDate: string;
  installmentNumber: number;
  installmentCount: number;
  amount: number;
  date: string;
}

export interface InvoiceEntries {
  charges: InvoiceCharge[];
  refunds: CreditCardRefundEntity[];
  payments: CreditCardPaymentEntity[];
}

export interface CreditCardInvoiceRepository {
  findByUuidForOwner(
    uuid: string,
    ownerId: number,
  ): Promise<CreditCardInvoiceEntity | null>;
  findByCardAndReferenceMonth(
    cardId: number,
    referenceMonth: string,
  ): Promise<CreditCardInvoiceEntity | null>;
  findTotals(
    ownerId: number,
    filter?: InvoiceTotalsFilter,
  ): Promise<InvoiceTotals[]>;
  findEntries(invoice: CreditCardInvoiceEntity): Promise<InvoiceEntries>;
  create(invoice: CreditCardInvoiceEntity): Promise<CreditCardInvoiceEntity>;
}
