import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  buildCreditCard,
  buildCreditCardInvoice,
  buildCreditCardPayment,
  buildCreditCardPurchase,
  buildCreditCardRefund,
} from '@test/support/builders/credit-card.builder';
import { CreditCardPaymentAlreadyCanceledError } from '../../errors/credit-card-payment-already-canceled.error';
import { CreditCardPurchaseNotDeletableError } from '../../errors/credit-card-purchase-not-deletable.error';
import { CreditCardRefundBeforePurchaseError } from '../../errors/credit-card-refund-before-purchase.error';
import { CreditCardRefundExceedsPurchaseError } from '../../errors/credit-card-refund-exceeds-purchase.error';
import { CreditCardRefundNotDeletableError } from '../../errors/credit-card-refund-not-deletable.error';
import { CreditCardEntity } from '../credit-card.entity';

describe('CreditCardEntity', () => {
  it('creates an active card', () => {
    const card = CreditCardEntity.create({
      uuid: 'new',
      ownerId: 3,
      name: 'Visa',
      creditLimit: 100000,
      closingDay: 5,
      dueDay: 12,
      isDefault: true,
    });

    expect(card).toMatchObject({
      id: 0,
      status: RecordStatus.ACTIVE,
      isDefault: true,
    });
  });

  it('drops the default flag when archived and keeps it off when reactivated', () => {
    const archived = buildCreditCard({ isDefault: true }).withStatus(
      RecordStatus.INACTIVE,
    );

    expect(archived.isDefault).toBe(false);
    expect(archived.withStatus(RecordStatus.ACTIVE).isDefault).toBe(false);
  });

  it('changes details and the default flag', () => {
    const card = buildCreditCard()
      .withDetails({
        name: 'Gold',
        creditLimit: 1,
        closingDay: 1,
        dueDay: 10,
      })
      .withDefault(true);

    expect(card).toMatchObject({
      name: 'Gold',
      creditLimit: 1,
      closingDay: 1,
      dueDay: 10,
      isDefault: true,
    });
  });
});

describe('CreditCardPurchaseEntity', () => {
  const open = buildCreditCardInvoice({ closingDate: '2026-11-05' });
  const closed = buildCreditCardInvoice({ closingDate: '2026-10-05' });

  it('orders installments and tracks refunds', () => {
    const purchase = buildCreditCardPurchase({
      amount: 30000,
      installments: [
        { number: 2, amount: 15000, date: '2026-11-29', invoice: open },
        { number: 1, amount: 15000, date: '2026-10-29', invoice: open },
      ],
      refunds: [{ uuid: 'r', amount: 5000, date: '2026-10-30', invoice: open }],
    });

    expect(purchase.installments.map(({ number }) => number)).toEqual([1, 2]);
    expect(purchase.installmentCount).toBe(2);
    expect(purchase.refundedAmount).toBe(5000);
    expect(purchase.refundableAmount).toBe(25000);
  });

  it('refuses refunds above what is left or dated before the purchase', () => {
    const purchase = buildCreditCardPurchase({
      amount: 30000,
      refunds: [
        { uuid: 'r', amount: 20000, date: '2026-10-30', invoice: open },
      ],
    });

    expect(() => purchase.assertRefundable(10000, '2026-10-30')).not.toThrow();
    expect(() => purchase.assertRefundable(10001, '2026-10-30')).toThrow(
      CreditCardRefundExceedsPurchaseError,
    );
    expect(() => purchase.assertRefundable(1, '2026-10-28')).toThrow(
      CreditCardRefundBeforePurchaseError,
    );
  });

  it('is deletable only while unbilled and unrefunded', () => {
    const unbilled = buildCreditCardPurchase({
      installments: [
        { number: 1, amount: 30000, date: '2026-10-29', invoice: open },
      ],
    });

    const billed = buildCreditCardPurchase({
      installments: [
        { number: 1, amount: 30000, date: '2026-10-01', invoice: closed },
      ],
    });

    const refunded = buildCreditCardPurchase({
      refunds: [{ uuid: 'r', amount: 1, date: '2026-10-30', invoice: open }],
    });

    expect(unbilled.isDeletableOn('2026-10-29')).toBe(true);
    expect(() => unbilled.assertDeletable('2026-10-29')).not.toThrow();
    expect(() => billed.assertDeletable('2026-10-29')).toThrow(
      CreditCardPurchaseNotDeletableError,
    );
    expect(() => refunded.assertDeletable('2026-10-29')).toThrow(
      CreditCardPurchaseNotDeletableError,
    );
  });

  it('changes description, category, and notes only', () => {
    const purchase = buildCreditCardPurchase();

    const updated = purchase.withDetails({
      description: 'Boots',
      category: purchase.category,
      notes: 'gift',
    });

    expect(updated).toMatchObject({
      description: 'Boots',
      notes: 'gift',
      amount: purchase.amount,
      purchaseDate: purchase.purchaseDate,
    });
    expect(updated.installments).toEqual(purchase.installments);
  });
});

describe('CreditCardRefundEntity', () => {
  it('can be deleted only while its invoice is open', () => {
    const refund = buildCreditCardRefund({
      invoice: buildCreditCardInvoice({ closingDate: '2026-11-05' }),
    });

    expect(() => refund.assertDeletable('2026-11-04')).not.toThrow();
    expect(() => refund.assertDeletable('2026-11-05')).toThrow(
      CreditCardRefundNotDeletableError,
    );
  });
});

describe('CreditCardPaymentEntity', () => {
  it('is canceled exactly once', () => {
    const canceled = buildCreditCardPayment().cancel();

    expect(canceled.canceledAt).toBeInstanceOf(Date);
    expect(() => canceled.cancel()).toThrow(
      CreditCardPaymentAlreadyCanceledError,
    );
  });
});
