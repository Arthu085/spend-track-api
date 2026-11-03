import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  ADMIN_CREDENTIALS,
  type AuthAgent,
  createAuthAgent,
} from './helpers/auth-agent';
import { createTestApp } from './helpers/create-test-app';
import { createIsolatedUser } from './helpers/isolated-user';

interface EnvelopeBody<T> {
  data: T;
  meta?: { total: number };
}

interface InvoiceRefShape {
  uuid: string;
  referenceMonth: string;
  closingDate: string;
  dueDate: string;
}

interface CardShape {
  uuid: string;
  isDefault: boolean;
  outstanding: string;
  availableLimit: string;
  creditBalance: string;
}

interface PurchaseShape {
  uuid: string;
  installmentCount: number;
  installments: Array<{
    number: number;
    amount: string;
    date: string;
    invoice: InvoiceRefShape;
  }>;
  refundedAmount: string;
  refundableAmount: string;
  deletable: boolean;
}

interface InvoiceShape extends InvoiceRefShape {
  charges: string;
  refunds: string;
  previousCredit: string;
  total: string;
  paid: string;
  outstanding: string;
  creditCarried: string;
  status: string;
  statusLabel: string;
  payments: Array<{ uuid: string; amount: string; canceledAt: string | null }>;
}

interface DashboardShape {
  perspective: string;
  balances: { actual: string; projected: string; available: string };
  expenses: { total: string; completed: string; pending: string };
  expensesByCategory: Array<{ category: { uuid: string }; total: string }>;
  creditCards: {
    spending: string;
    outstanding: string;
    invoices: Array<{ uuid: string; outstanding: string }>;
  };
}

function dataOf<T>(body: unknown): T {
  return (body as EnvelopeBody<T>).data;
}

// Every scenario uses dates of 2025 so invoice statuses do not depend on the
// day the suite runs. Login is throttled, so scenarios share one isolated
// user, except the one that reads user-wide dashboard totals.
describe('Credit cards (e2e)', () => {
  let app: INestApplication<App>;
  let shared: AuthAgent;

  beforeAll(async () => {
    app = await createTestApp();
    shared = await newAgent();
  });

  afterAll(async () => {
    await app.close();
  });

  interface Wallet {
    agent: AuthAgent;
    bank: string;
    groceries: string;
    card: string;
  }

  async function newAgent(): Promise<AuthAgent> {
    return createAuthAgent(app, await createIsolatedUser(app));
  }

  async function newWallet(agent: AuthAgent = shared): Promise<Wallet> {
    const bank = await agent
      .post('/api/accounts')
      .send({
        name: 'Bank',
        type: 'CHECKING',
        openingBalance: '1000.00',
        openingBalanceDate: '2025-01-01',
      })
      .expect(201);

    const groceries = await agent
      .post('/api/transaction-categories')
      .send({ name: 'Groceries', kind: 'EXPENSE' })
      .expect(201);

    const card = await agent
      .post('/api/credit-cards')
      .send({
        name: 'Visa',
        creditLimit: '5000.00',
        closingDay: 5,
        dueDay: 12,
      })
      .expect(201);

    return {
      agent,
      bank: dataOf<{ uuid: string }>(bank.body).uuid,
      groceries: dataOf<{ uuid: string }>(groceries.body).uuid,
      card: dataOf<CardShape>(card.body).uuid,
    };
  }

  async function buy(
    wallet: Wallet,
    body: Record<string, unknown>,
  ): Promise<PurchaseShape> {
    const response = await wallet.agent
      .post('/api/credit-card-purchases')
      .send({
        cardUuid: wallet.card,
        categoryUuid: wallet.groceries,
        description: 'Market',
        amount: '300.00',
        purchaseDate: '2025-10-29',
        ...body,
      })
      .expect(201);

    return dataOf<PurchaseShape>(response.body);
  }

  async function invoice(wallet: Wallet, uuid: string): Promise<InvoiceShape> {
    const response = await wallet.agent
      .get(`/api/credit-card-invoices/${uuid}`)
      .expect(200);

    return dataOf<InvoiceShape>(response.body);
  }

  function pay(wallet: Wallet, uuid: string, amount: string) {
    return wallet.agent
      .post(`/api/credit-card-invoices/${uuid}/payments`)
      .send({ accountUuid: wallet.bank, amount, paidOn: '2025-11-12' });
  }

  async function balanceOf(wallet: Wallet): Promise<string> {
    const response = await wallet.agent
      .get(`/api/accounts/${wallet.bank}`)
      .expect(200);

    return dataOf<{ currentBalance: string }>(response.body).currentBalance;
  }

  async function cardOf(wallet: Wallet): Promise<CardShape> {
    const response = await wallet.agent
      .get(`/api/credit-cards/${wallet.card}`)
      .expect(200);

    return dataOf<CardShape>(response.body);
  }

  it('puts an October purchase on the November invoice and counts it once in each perspective', async () => {
    const wallet = await newWallet(await newAgent());
    const purchase = await buy(wallet, {});
    const november = purchase.installments[0].invoice;

    expect(november).toMatchObject({
      referenceMonth: '2025-11-01',
      closingDate: '2025-11-05',
      dueDate: '2025-11-12',
    });

    const dashboard = async (month: number, perspective: string) =>
      dataOf<DashboardShape>(
        (
          await wallet.agent
            .get(
              `/api/dashboard?year=2025&month=${month}&perspective=${perspective}`,
            )
            .expect(200)
        ).body,
      );

    expect((await dashboard(10, 'PURCHASE_DATE')).expenses.total).toBe(
      '300.00',
    );
    expect((await dashboard(10, 'INVOICE_MONTH')).expenses.total).toBe('0.00');

    const beforePayment = await dashboard(11, 'INVOICE_MONTH');

    expect(beforePayment.expenses.total).toBe('300.00');
    expect(
      beforePayment.expensesByCategory.map(({ category, total }) => [
        category.uuid,
        total,
      ]),
    ).toEqual([[wallet.groceries, '300.00']]);
    expect(beforePayment.creditCards).toMatchObject({
      spending: '300.00',
      outstanding: '300.00',
      invoices: [{ uuid: november.uuid, outstanding: '300.00' }],
    });
    expect(beforePayment.balances).toMatchObject({
      actual: '1000.00',
      available: '700.00',
    });

    await pay(wallet, november.uuid, '300.00').expect(201);

    const afterPayment = await dashboard(11, 'INVOICE_MONTH');

    expect(afterPayment.expenses.total).toBe('300.00');
    expect(afterPayment.creditCards.outstanding).toBe('0.00');
    expect(afterPayment.balances).toMatchObject({
      actual: '700.00',
      available: '700.00',
    });
    expect((await dashboard(11, 'PURCHASE_DATE')).expenses.total).toBe('0.00');
    await expect(balanceOf(wallet)).resolves.toBe('700.00');
    await expect(invoice(wallet, november.uuid)).resolves.toMatchObject({
      paid: '300.00',
      outstanding: '0.00',
      status: 'PAID',
    });
  });

  it('splits a purchase into three installments on consecutive invoices that sum to the total', async () => {
    const wallet = await newWallet();

    const purchase = await buy(wallet, {
      amount: '100.00',
      installmentCount: 3,
    });

    expect(purchase.installmentCount).toBe(3);
    expect(
      purchase.installments.map(({ number, amount, date, invoice }) => [
        number,
        amount,
        date,
        invoice.referenceMonth,
      ]),
    ).toEqual([
      [1, '33.34', '2025-10-29', '2025-11-01'],
      [2, '33.33', '2025-11-29', '2025-12-01'],
      [3, '33.33', '2025-12-29', '2026-01-01'],
    ]);

    const invoices = await wallet.agent
      .get(`/api/credit-cards/${wallet.card}/invoices`)
      .expect(200);

    expect(
      dataOf<InvoiceShape[]>(invoices.body).map(({ total }) => total),
    ).toEqual(['33.33', '33.33', '33.34']);
    await expect(cardOf(wallet)).resolves.toMatchObject({
      outstanding: '100.00',
      availableLimit: '4900.00',
    });
    expect(purchase.deletable).toBe(false);
    await wallet.agent
      .delete(`/api/credit-card-purchases/${purchase.uuid}`)
      .expect(409);
  });

  it('accepts partial payments up to the outstanding amount and restores the balance on cancellation', async () => {
    const wallet = await newWallet();
    const purchase = await buy(wallet, {});
    const { uuid } = purchase.installments[0].invoice;

    const partial = dataOf<{ uuid: string }>(
      (await pay(wallet, uuid, '100.00').expect(201)).body,
    );

    await expect(invoice(wallet, uuid)).resolves.toMatchObject({
      paid: '100.00',
      outstanding: '200.00',
      status: 'OVERDUE',
    });
    await pay(wallet, uuid, '200.01').expect(422);
    await expect(balanceOf(wallet)).resolves.toBe('900.00');

    await wallet.agent
      .put(
        `/api/credit-card-invoices/${uuid}/payments/${partial.uuid}/cancellation`,
      )
      .expect(200);
    await wallet.agent
      .put(
        `/api/credit-card-invoices/${uuid}/payments/${partial.uuid}/cancellation`,
      )
      .expect(409);

    await expect(balanceOf(wallet)).resolves.toBe('1000.00');
    const canceled = await invoice(wallet, uuid);

    expect(canceled).toMatchObject({ paid: '0.00', outstanding: '300.00' });
    expect(canceled.payments[0].canceledAt).not.toBeNull();
  });

  it('credits a refund made after payment to a later invoice and carries the credit forward', async () => {
    const wallet = await newWallet();
    const purchase = await buy(wallet, { amount: '200.00' });
    const november = purchase.installments[0].invoice;

    await pay(wallet, november.uuid, '200.00').expect(201);

    const refundPath = `/api/credit-card-purchases/${purchase.uuid}/refunds`;

    await wallet.agent
      .post(refundPath)
      .send({ amount: '10.00', date: '2025-10-01' })
      .expect(422);
    await wallet.agent
      .post(refundPath)
      .send({ amount: '200.01', date: '2025-11-20' })
      .expect(422);

    const refund = await wallet.agent
      .post(refundPath)
      .send({ amount: '50.00', date: '2025-11-20' })
      .expect(201);

    const refundData = dataOf<{ uuid: string; invoice: InvoiceRefShape }>(
      refund.body,
    );

    expect(refundData.invoice.referenceMonth).toBe('2025-12-01');
    await expect(invoice(wallet, november.uuid)).resolves.toMatchObject({
      outstanding: '0.00',
      status: 'PAID',
    });
    await expect(
      invoice(wallet, refundData.invoice.uuid),
    ).resolves.toMatchObject({
      refunds: '50.00',
      total: '-50.00',
      creditCarried: '50.00',
    });
    await expect(cardOf(wallet)).resolves.toMatchObject({
      outstanding: '0.00',
      creditBalance: '50.00',
      availableLimit: '5050.00',
    });

    const reloaded = await wallet.agent
      .get(`/api/credit-card-purchases/${purchase.uuid}`)
      .expect(200);

    expect(dataOf<PurchaseShape>(reloaded.body)).toMatchObject({
      refundedAmount: '50.00',
      refundableAmount: '150.00',
    });
    await wallet.agent.delete(`${refundPath}/${refundData.uuid}`).expect(409);
  });

  it('keeps one default card and blocks purchases on an archived card', async () => {
    const wallet = await newWallet();

    const first = await wallet.agent
      .post('/api/credit-cards')
      .send({
        name: 'Master',
        creditLimit: '100.00',
        closingDay: 25,
        dueDay: 5,
        isDefault: true,
      })
      .expect(201);

    const second = await wallet.agent
      .post('/api/credit-cards')
      .send({
        name: 'Elo',
        creditLimit: '100.00',
        closingDay: 25,
        dueDay: 5,
        isDefault: true,
      })
      .expect(201);

    const firstUuid = dataOf<CardShape>(first.body).uuid;

    expect(dataOf<CardShape>(second.body).isDefault).toBe(true);
    await expect(cardOf({ ...wallet, card: firstUuid })).resolves.toMatchObject(
      { isDefault: false },
    );

    await wallet.agent
      .put(`/api/credit-cards/${firstUuid}/status`)
      .send({ status: 'INACTIVE' })
      .expect(200);
    await wallet.agent
      .post('/api/credit-card-purchases')
      .send({
        cardUuid: firstUuid,
        categoryUuid: wallet.groceries,
        description: 'Market',
        amount: '10.00',
        purchaseDate: '2025-10-29',
      })
      .expect(409);

    const purchase = await buy(wallet, {});

    await wallet.agent.delete(`/api/credit-cards/${wallet.card}`).expect(409);
    await wallet.agent.delete(`/api/credit-cards/${firstUuid}`).expect(200);

    expect(purchase.installments[0].invoice.referenceMonth).toBe('2025-11-01');
  });

  describe('ownership', () => {
    let wallet: Wallet;
    let purchase: PurchaseShape;
    let admin: AuthAgent;

    beforeAll(async () => {
      wallet = await newWallet();
      purchase = await buy(wallet, {});
      admin = await createAuthAgent(app, ADMIN_CREDENTIALS);
    });

    it.each([
      [
        'GET card',
        (agent: AuthAgent) => agent.get(`/api/credit-cards/${wallet.card}`),
      ],
      [
        'GET card invoices',
        (agent: AuthAgent) =>
          agent.get(`/api/credit-cards/${wallet.card}/invoices`),
      ],
      [
        'PATCH card',
        (agent: AuthAgent) =>
          agent.patch(`/api/credit-cards/${wallet.card}`).send({ name: 'X' }),
      ],
      [
        'DELETE card',
        (agent: AuthAgent) => agent.delete(`/api/credit-cards/${wallet.card}`),
      ],
      [
        'GET purchase',
        (agent: AuthAgent) =>
          agent.get(`/api/credit-card-purchases/${purchase.uuid}`),
      ],
      [
        'PATCH purchase',
        (agent: AuthAgent) =>
          agent
            .patch(`/api/credit-card-purchases/${purchase.uuid}`)
            .send({ description: 'X' }),
      ],
      [
        'POST refund',
        (agent: AuthAgent) =>
          agent
            .post(`/api/credit-card-purchases/${purchase.uuid}/refunds`)
            .send({ amount: '1.00', date: '2025-10-30' }),
      ],
      [
        'GET invoice',
        (agent: AuthAgent) =>
          agent.get(
            `/api/credit-card-invoices/${purchase.installments[0].invoice.uuid}`,
          ),
      ],
    ])('answers 404 to an admin who tries %s', async (_, send) => {
      await send(admin).expect(404);
    });

    it("does not let an admin pay the owner's invoice from any account", async () => {
      const adminAccount = await admin
        .post('/api/accounts')
        .send({
          name: 'Admin bank',
          type: 'CHECKING',
          openingBalance: '10.00',
          openingBalanceDate: '2025-01-01',
        })
        .expect(201);

      await admin
        .post(
          `/api/credit-card-invoices/${purchase.installments[0].invoice.uuid}/payments`,
        )
        .send({
          accountUuid: dataOf<{ uuid: string }>(adminAccount.body).uuid,
          amount: '1.00',
        })
        .expect(404);

      const purchases = await admin
        .get('/api/credit-card-purchases')
        .expect(200);

      expect(
        dataOf<PurchaseShape[]>(purchases.body).map(({ uuid }) => uuid),
      ).not.toContain(purchase.uuid);
      await expect(
        invoice(wallet, purchase.installments[0].invoice.uuid),
      ).resolves.toMatchObject({
        paid: '0.00',
      });
    });
  });
});
