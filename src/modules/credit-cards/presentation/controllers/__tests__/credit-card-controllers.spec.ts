import { PaginatedResult } from '@shared/application/dto';
import { PaginationQueryDto } from '@shared/presentation/dto';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { PendingOperationsDecision } from '@shared/domain/pending-operations';
import type { Translate } from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import {
  buildCreditCard,
  buildCreditCardPayment,
  buildCreditCardPurchase,
  buildCreditCardRefund,
  buildInvoiceStatement,
} from '@test/support/builders/credit-card.builder';
import { buildTransactionCategory } from '@test/support/builders/transaction-category.builder';
import { mockOf } from '@test/support/mocks/mock-of';
import type { CancelCreditCardPaymentUseCase } from '../../../application/use-cases/cancel-credit-card-payment.use-case';
import type { CreateCreditCardPurchaseUseCase } from '../../../application/use-cases/create-credit-card-purchase.use-case';
import type { CreateCreditCardRefundUseCase } from '../../../application/use-cases/create-credit-card-refund.use-case';
import type { CreateCreditCardUseCase } from '../../../application/use-cases/create-credit-card.use-case';
import type { DeleteCreditCardPurchaseUseCase } from '../../../application/use-cases/delete-credit-card-purchase.use-case';
import type { DeleteCreditCardRefundUseCase } from '../../../application/use-cases/delete-credit-card-refund.use-case';
import type { DeleteCreditCardUseCase } from '../../../application/use-cases/delete-credit-card.use-case';
import type { GetCreditCardInvoiceUseCase } from '../../../application/use-cases/get-credit-card-invoice.use-case';
import type { GetCreditCardPurchaseUseCase } from '../../../application/use-cases/get-credit-card-purchase.use-case';
import type { GetCreditCardPendingOperationsUseCase } from '../../../application/use-cases/get-credit-card-pending-operations.use-case';
import type { GetCreditCardUseCase } from '../../../application/use-cases/get-credit-card.use-case';
import type { ListCreditCardInvoicesUseCase } from '../../../application/use-cases/list-credit-card-invoices.use-case';
import type { ListCreditCardPurchasesUseCase } from '../../../application/use-cases/list-credit-card-purchases.use-case';
import type { ListCreditCardsUseCase } from '../../../application/use-cases/list-credit-cards.use-case';
import type { PayCreditCardInvoiceUseCase } from '../../../application/use-cases/pay-credit-card-invoice.use-case';
import type { UpdateCreditCardPurchaseUseCase } from '../../../application/use-cases/update-credit-card-purchase.use-case';
import type { UpdateCreditCardStatusUseCase } from '../../../application/use-cases/update-credit-card-status.use-case';
import type { UpdateCreditCardUseCase } from '../../../application/use-cases/update-credit-card.use-case';
import { ListCreditCardPurchasesQueryDto } from '../../dto/input/list-credit-card-purchases-query.dto';
import { ListCreditCardsQueryDto } from '../../dto/input/list-credit-cards-query.dto';
import { CreditCardInvoicesController } from '../credit-card-invoices.controller';
import { CreditCardPurchasesController } from '../credit-card-purchases.controller';
import { CreditCardsController } from '../credit-cards.controller';

const translate: Translate = (key) => `t:${key}`;

const actor: AuthenticatedUser = {
  id: 41,
  uuid: 'actor-uuid',
  email: 'actor@example.com',
  name: 'Actor',
  roles: ['ADMIN'],
};

const withBalance = {
  card: buildCreditCard({ creditLimit: 500000, isDefault: true }),
  balance: { outstanding: 120000, creditBalance: 1000 },
};

describe('CreditCardsController', () => {
  const execute = jest.fn().mockResolvedValue(withBalance);

  const listExecute = jest
    .fn()
    .mockResolvedValue(PaginatedResult.of([withBalance], 1, 1, 20));

  const invoicesExecute = jest
    .fn()
    .mockResolvedValue(PaginatedResult.of([buildInvoiceStatement()], 1, 1, 20));

  const deleteExecute = jest.fn().mockResolvedValue(undefined);

  const pendingOperationsExecute = jest
    .fn()
    .mockResolvedValue({ count: 2, total: 11180 });

  const controller = new CreditCardsController(
    mockOf<ListCreditCardsUseCase>({ execute: listExecute }),
    mockOf<GetCreditCardUseCase>({ execute }),
    mockOf<ListCreditCardInvoicesUseCase>({ execute: invoicesExecute }),
    mockOf<GetCreditCardPendingOperationsUseCase>({
      execute: pendingOperationsExecute,
    }),
    mockOf<CreateCreditCardUseCase>({ execute }),
    mockOf<UpdateCreditCardUseCase>({ execute }),
    mockOf<UpdateCreditCardStatusUseCase>({ execute }),
    mockOf<DeleteCreditCardUseCase>({ execute: deleteExecute }),
  );

  it('serializes cards with their limits and balances', async () => {
    const page = await controller.findAll(
      Object.assign(new ListCreditCardsQueryDto(), {
        page: 1,
        limit: 20,
        status: RecordStatus.ACTIVE,
      }),
      actor,
      translate,
    );

    expect(listExecute).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 41, status: RecordStatus.ACTIVE }),
    );
    expect(page.items[0]).toMatchObject({
      uuid: 'card-uuid',
      creditLimit: '5000.00',
      outstanding: '1200.00',
      availableLimit: '3810.00',
      creditBalance: '10.00',
      closingDay: 5,
      dueDay: 12,
      statusLabel: 't:enums.record_status.active',
    });

    await expect(
      controller.findOne('card-uuid', actor, translate),
    ).resolves.toMatchObject({ uuid: 'card-uuid' });
  });

  it('lists the invoices of a card', async () => {
    const page = await controller.findInvoices(
      'card-uuid',
      Object.assign(new PaginationQueryDto(), { page: 1, limit: 20 }),
      actor,
      translate,
    );

    expect(page.items[0]).toMatchObject({
      referenceMonth: '2026-11-01',
      charges: '300.00',
      total: '300.00',
      statusLabel: 't:credit_cards.invoice_status.open',
    });
  });

  it('converts decimal amounts to cents on create and update', async () => {
    await controller.create(
      { name: 'Visa', creditLimit: '5000.50', closingDay: 5, dueDay: 12 },
      actor,
      translate,
    );

    expect(execute).toHaveBeenLastCalledWith({
      ownerId: 41,
      name: 'Visa',
      creditLimit: 500050,
      closingDay: 5,
      dueDay: 12,
      isDefault: false,
    });

    await controller.update('card-uuid', { dueDay: 20 }, actor, translate);
    expect(execute).toHaveBeenLastCalledWith(
      expect.objectContaining({ creditLimit: undefined, dueDay: 20 }),
    );

    await controller.update(
      'card-uuid',
      { creditLimit: '1.00' },
      actor,
      translate,
    );
    expect(execute).toHaveBeenLastCalledWith(
      expect.objectContaining({ creditLimit: 100 }),
    );
  });

  it('serializes the planned operations with an exact total', async () => {
    await expect(
      controller.findPendingOperations('card-uuid', actor),
    ).resolves.toEqual({ count: 2, total: '111.80' });
    expect(pendingOperationsExecute).toHaveBeenCalledWith('card-uuid', 41);
  });

  it('forwards the decision about planned operations', async () => {
    await controller.updateStatus(
      'card-uuid',
      {
        status: RecordStatus.INACTIVE,
        pendingOperations: PendingOperationsDecision.CANCEL,
      },
      actor,
      translate,
    );

    expect(execute).toHaveBeenLastCalledWith({
      uuid: 'card-uuid',
      ownerId: 41,
      status: RecordStatus.INACTIVE,
      pendingOperations: PendingOperationsDecision.CANCEL,
    });
  });

  it('changes the status and deletes', async () => {
    await controller.updateStatus(
      'card-uuid',
      { status: RecordStatus.INACTIVE },
      actor,
      translate,
    );
    expect(execute).toHaveBeenLastCalledWith({
      uuid: 'card-uuid',
      ownerId: 41,
      status: RecordStatus.INACTIVE,
    });

    await controller.remove('card-uuid', actor);
    expect(deleteExecute).toHaveBeenCalledWith({
      uuid: 'card-uuid',
      ownerId: 41,
    });
  });
});

describe('CreditCardInvoicesController', () => {
  const groceries = buildTransactionCategory({ name: 'Groceries' });
  const payExecute = jest.fn().mockResolvedValue(buildCreditCardPayment());

  const controller = new CreditCardInvoicesController(
    mockOf<GetCreditCardInvoiceUseCase>({
      execute: jest.fn().mockResolvedValue({
        statement: buildInvoiceStatement({ paid: 10000, outstanding: 20000 }),
        entries: {
          charges: [
            {
              purchaseUuid: 'purchase-uuid',
              description: 'Shoes',
              category: groceries,
              purchaseDate: '2026-10-29',
              installmentNumber: 1,
              installmentCount: 3,
              amount: 10000,
              date: '2026-10-29',
            },
          ],
          refunds: [buildCreditCardRefund()],
          payments: [buildCreditCardPayment()],
        },
      }),
    }),
    mockOf<PayCreditCardInvoiceUseCase>({ execute: payExecute }),
    mockOf<CancelCreditCardPaymentUseCase>({
      execute: jest
        .fn()
        .mockResolvedValue(
          buildCreditCardPayment({ canceledAt: new Date('2026-11-11') }),
        ),
    }),
  );

  it('serializes an invoice with its charges, refunds, and payments', async () => {
    const detail = await controller.findOne('invoice-uuid', actor, translate);

    expect(detail).toMatchObject({
      paid: '100.00',
      outstanding: '200.00',
      chargeEntries: [
        {
          installmentNumber: 1,
          installmentCount: 3,
          amount: '100.00',
          category: { name: 'Groceries' },
        },
      ],
      refundEntries: [{ amount: '50.00', purchase: { description: 'Shoes' } }],
      payments: [{ amount: '100.00', account: { uuid: 'account-uuid' } }],
    });
  });

  it('pays and cancels payments', async () => {
    await controller.pay(
      'invoice-uuid',
      { accountUuid: 'account-uuid', amount: '99.90' },
      actor,
    );

    expect(payExecute).toHaveBeenCalledWith({
      invoiceUuid: 'invoice-uuid',
      ownerId: 41,
      accountUuid: 'account-uuid',
      amount: 9990,
      paidOn: undefined,
    });

    await expect(
      controller.cancelPayment('invoice-uuid', 'payment-uuid', actor),
    ).resolves.toMatchObject({ canceledAt: new Date('2026-11-11') });
  });
});

describe('CreditCardPurchasesController', () => {
  const purchase = buildCreditCardPurchase();
  const execute = jest.fn().mockResolvedValue(purchase);
  const refundExecute = jest.fn().mockResolvedValue(buildCreditCardRefund());
  const deleteExecute = jest.fn().mockResolvedValue(undefined);

  const controller = new CreditCardPurchasesController(
    mockOf<ListCreditCardPurchasesUseCase>({
      execute: jest
        .fn()
        .mockResolvedValue(PaginatedResult.of([purchase], 1, 1, 20)),
    }),
    mockOf<GetCreditCardPurchaseUseCase>({ execute }),
    mockOf<CreateCreditCardPurchaseUseCase>({ execute }),
    mockOf<CreateCreditCardRefundUseCase>({ execute: refundExecute }),
    mockOf<UpdateCreditCardPurchaseUseCase>({ execute }),
    mockOf<DeleteCreditCardPurchaseUseCase>({ execute: deleteExecute }),
    mockOf<DeleteCreditCardRefundUseCase>({ execute: deleteExecute }),
  );

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-29T15:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('serializes purchases with installments and refund state', async () => {
    const page = await controller.findAll(
      Object.assign(new ListCreditCardPurchasesQueryDto(), {
        page: 1,
        limit: 20,
      }),
      actor,
      translate,
    );

    expect(page.items[0]).toMatchObject({
      amount: '300.00',
      installmentCount: 1,
      installments: [
        { number: 1, amount: '300.00', invoice: { uuid: 'invoice-uuid' } },
      ],
      refundedAmount: '0.00',
      refundableAmount: '300.00',
      deletable: true,
      card: { uuid: 'card-uuid' },
    });

    await expect(
      controller.findOne('purchase-uuid', actor, translate),
    ).resolves.toMatchObject({ uuid: 'purchase-uuid' });
  });

  it('creates purchases with one installment by default', async () => {
    await controller.create(
      {
        cardUuid: 'card-uuid',
        categoryUuid: 'category-uuid',
        description: 'Shoes',
        amount: '300.00',
        purchaseDate: '2026-10-29',
      },
      actor,
      translate,
    );

    expect(execute).toHaveBeenLastCalledWith(
      expect.objectContaining({
        amount: 30000,
        installmentCount: 1,
        notes: null,
      }),
    );
  });

  it('records refunds, updates, and deletes', async () => {
    await expect(
      controller.refund(
        'purchase-uuid',
        { amount: '50.00', date: '2026-10-30' },
        actor,
      ),
    ).resolves.toMatchObject({
      amount: '50.00',
      invoice: { uuid: 'invoice-uuid' },
    });
    expect(refundExecute).toHaveBeenCalledWith({
      purchaseUuid: 'purchase-uuid',
      ownerId: 41,
      amount: 5000,
      date: '2026-10-30',
      notes: null,
    });

    await controller.update(
      'purchase-uuid',
      { description: 'Boots' },
      actor,
      translate,
    );
    expect(execute).toHaveBeenLastCalledWith(
      expect.objectContaining({ uuid: 'purchase-uuid', description: 'Boots' }),
    );

    await controller.remove('purchase-uuid', actor);
    await controller.removeRefund('purchase-uuid', 'refund-uuid', actor);
    expect(deleteExecute).toHaveBeenLastCalledWith({
      purchaseUuid: 'purchase-uuid',
      refundUuid: 'refund-uuid',
      ownerId: 41,
    });
  });
});
