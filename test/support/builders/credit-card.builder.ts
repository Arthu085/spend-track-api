import {
  CreditCardEntity,
  type ReconstituteCreditCardInput,
} from '@modules/credit-cards/domain/entities/credit-card.entity';
import {
  CreditCardInvoiceEntity,
  type ReconstituteCreditCardInvoiceInput,
} from '@modules/credit-cards/domain/entities/credit-card-invoice.entity';
import {
  CreditCardPurchaseEntity,
  type ReconstituteCreditCardPurchaseInput,
} from '@modules/credit-cards/domain/entities/credit-card-purchase.entity';
import {
  CreditCardPaymentEntity,
  type ReconstituteCreditCardPaymentInput,
} from '@modules/credit-cards/domain/entities/credit-card-payment.entity';
import {
  CreditCardRefundEntity,
  type ReconstituteCreditCardRefundInput,
} from '@modules/credit-cards/domain/entities/credit-card-refund.entity';
import type { InvoiceStatement } from '@modules/credit-cards/domain/billing/invoice-statement';
import { CreditCardInvoiceStatus } from '@modules/credit-cards/domain/enums/credit-card-invoice-status.enum';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { buildAccount } from './account.builder';
import { buildTransactionCategory } from './transaction-category.builder';

const CREATED_AT = new Date('2026-10-01T00:00:00Z');

export function buildCreditCard(
  overrides: Partial<ReconstituteCreditCardInput> = {},
): CreditCardEntity {
  return CreditCardEntity.reconstitute({
    id: 1,
    uuid: 'card-uuid',
    status: RecordStatus.ACTIVE,
    ownerId: 1,
    name: 'Visa',
    creditLimit: 500000,
    closingDay: 5,
    dueDay: 12,
    isDefault: false,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    deletedAt: null,
    ...overrides,
  });
}

export function buildCreditCardInvoice(
  overrides: Partial<ReconstituteCreditCardInvoiceInput> = {},
): CreditCardInvoiceEntity {
  return CreditCardInvoiceEntity.reconstitute({
    id: 1,
    uuid: 'invoice-uuid',
    card: buildCreditCard(),
    referenceMonth: '2026-11-01',
    closingDate: '2026-11-05',
    dueDate: '2026-11-12',
    createdAt: CREATED_AT,
    ...overrides,
  });
}

export function buildCreditCardPurchase(
  overrides: Partial<ReconstituteCreditCardPurchaseInput> = {},
): CreditCardPurchaseEntity {
  const invoice = buildCreditCardInvoice();

  return CreditCardPurchaseEntity.reconstitute({
    id: 1,
    uuid: 'purchase-uuid',
    status: RecordStatus.ACTIVE,
    ownerId: 1,
    card: invoice.card,
    category: buildTransactionCategory(),
    description: 'Shoes',
    amount: 30000,
    purchaseDate: '2026-10-29',
    notes: null,
    installments: [{ number: 1, amount: 30000, date: '2026-10-29', invoice }],
    refunds: [],
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    deletedAt: null,
    ...overrides,
  });
}

export function buildCreditCardRefund(
  overrides: Partial<ReconstituteCreditCardRefundInput> = {},
): CreditCardRefundEntity {
  return CreditCardRefundEntity.reconstitute({
    id: 1,
    uuid: 'refund-uuid',
    status: RecordStatus.ACTIVE,
    ownerId: 1,
    purchase: { id: 1, uuid: 'purchase-uuid', description: 'Shoes' },
    invoice: buildCreditCardInvoice(),
    amount: 5000,
    date: '2026-10-30',
    notes: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    deletedAt: null,
    ...overrides,
  });
}

export function buildCreditCardPayment(
  overrides: Partial<ReconstituteCreditCardPaymentInput> = {},
): CreditCardPaymentEntity {
  return CreditCardPaymentEntity.reconstitute({
    id: 1,
    uuid: 'payment-uuid',
    status: RecordStatus.ACTIVE,
    ownerId: 1,
    invoice: buildCreditCardInvoice(),
    account: buildAccount(),
    amount: 10000,
    paidOn: '2026-11-10',
    canceledAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    deletedAt: null,
    ...overrides,
  });
}

export function buildInvoiceStatement(
  overrides: Partial<InvoiceStatement> = {},
): InvoiceStatement {
  return {
    invoice: buildCreditCardInvoice(),
    charges: 30000,
    credits: 0,
    paid: 0,
    previousCredit: 0,
    total: 30000,
    outstanding: 30000,
    creditCarried: 0,
    status: CreditCardInvoiceStatus.OPEN,
    ...overrides,
  };
}
