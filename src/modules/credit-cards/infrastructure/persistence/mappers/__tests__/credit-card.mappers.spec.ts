import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import {
  buildCreditCard,
  buildCreditCardInvoice,
  buildCreditCardPayment,
  buildCreditCardPurchase,
  buildCreditCardRefund,
} from '@test/support/builders/credit-card.builder';
import { CreditCardInvoiceOrmEntity } from '../../entities/credit-card-invoice.orm-entity';
import { CreditCardPaymentOrmEntity } from '../../entities/credit-card-payment.orm-entity';
import { CreditCardPurchaseOrmEntity } from '../../entities/credit-card-purchase.orm-entity';
import { CreditCardRefundOrmEntity } from '../../entities/credit-card-refund.orm-entity';
import { CreditCardInvoiceMapper } from '../credit-card-invoice.mapper';
import { CreditCardMapper } from '../credit-card.mapper';
import { CreditCardPaymentMapper } from '../credit-card-payment.mapper';
import { CreditCardPurchaseMapper } from '../credit-card-purchase.mapper';
import { CreditCardRefundMapper } from '../credit-card-refund.mapper';

describe('credit card mappers', () => {
  it('round-trips a card with money as a decimal string', () => {
    const card = buildCreditCard({ id: 3, creditLimit: 123456 });
    const orm = CreditCardMapper.toOrm(card);

    expect(orm).toMatchObject({ id: 3, creditLimit: '1234.56', closingDay: 5 });
    expect(CreditCardMapper.toDomain(orm)).toMatchObject({
      creditLimit: 123456,
      status: RecordStatus.ACTIVE,
    });
  });

  it('leaves the id unset for a new card', () => {
    expect(
      CreditCardMapper.toOrm(buildCreditCard({ id: 0 })).id,
    ).toBeUndefined();
  });

  it('maps an invoice with its card relation', () => {
    const invoice = buildCreditCardInvoice({ id: 7 });
    const orm = CreditCardInvoiceMapper.toOrm(invoice);

    expect(orm).toMatchObject({ id: 7, creditCardId: 1, userId: 1 });

    orm.creditCard = CreditCardMapper.toOrm(invoice.card);
    expect(CreditCardInvoiceMapper.toDomain(orm).card.uuid).toBe('card-uuid');

    orm.creditCard = undefined;
    expect(() => CreditCardInvoiceMapper.toDomain(orm)).toThrow(
      'Invoice credit card relation must be loaded',
    );
  });

  it('writes the installments of a new purchase only', () => {
    const fresh = CreditCardPurchaseMapper.toOrm(
      buildCreditCardPurchase({ id: 0 }),
    );

    expect(fresh.installments).toEqual([
      expect.objectContaining({ number: 1, amount: '300.00', invoiceId: 1 }),
    ]);
    expect(
      CreditCardPurchaseMapper.toOrm(buildCreditCardPurchase()).installments,
    ).toBeUndefined();
  });

  it('reads a purchase and drops deleted refunds', () => {
    const purchase = buildCreditCardPurchase();

    const invoiceOrm = CreditCardInvoiceMapper.toOrm(
      purchase.installments[0].invoice,
    );

    const refund = (deletedAt: Date | null) =>
      Object.assign(new CreditCardRefundOrmEntity(), {
        uuid: deletedAt ? 'gone' : 'kept',
        amount: '10.00',
        date: '2026-10-30',
        deletedAt,
        invoice: invoiceOrm,
      });

    const orm = Object.assign(CreditCardPurchaseMapper.toOrm(purchase), {
      createdAt: purchase.createdAt,
      creditCard: CreditCardMapper.toOrm(purchase.card),
      category: {
        id: 5,
        uuid: 'category-uuid',
        userId: null,
        code: null,
        name: 'Pets',
        kind: purchase.category.kind,
        color: null,
        status: RecordStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      installments: [
        Object.assign(new CreditCardInvoiceOrmEntity(), {}) && {
          number: 1,
          amount: '300.00',
          date: '2026-10-29',
          invoice: invoiceOrm,
        },
      ],
      refunds: [refund(null), refund(new Date())],
    }) as CreditCardPurchaseOrmEntity;

    const domain = CreditCardPurchaseMapper.toDomain(orm);

    expect(domain.refunds.map(({ uuid }) => uuid)).toEqual(['kept']);
    expect(domain.installments[0]).toMatchObject({ amount: 30000 });

    expect(() =>
      CreditCardPurchaseMapper.toDomain(
        Object.assign(new CreditCardPurchaseOrmEntity(), orm, {
          installments: undefined,
        }),
      ),
    ).toThrow('Purchase installments relation must be loaded');
  });

  it('maps refunds and payments with their relations', () => {
    const refund = buildCreditCardRefund();
    const refundOrm = CreditCardRefundMapper.toOrm(refund);

    expect(refundOrm).toMatchObject({ amount: '50.00', purchaseId: 1 });
    expect(() => CreditCardRefundMapper.toDomain(refundOrm)).toThrow();

    const payment = buildCreditCardPayment();
    const paymentOrm = CreditCardPaymentMapper.toOrm(payment);

    expect(paymentOrm).toMatchObject({ amount: '100.00', accountId: 1 });
    expect(() =>
      CreditCardPaymentMapper.toDomain(new CreditCardPaymentOrmEntity()),
    ).toThrow();
  });
});
