import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { type AuthAgent, createAuthAgent } from './helpers/auth-agent';
import { createTestApp } from './helpers/create-test-app';
import { createIsolatedUser } from './helpers/isolated-user';

interface Installment {
  invoice: { uuid: string; referenceMonth: string };
}

interface Payment {
  uuid: string;
  source: string;
  sourceLabel: string;
  canceledAt: string | null;
}

interface Invoice {
  paid: string;
  outstanding: string;
  status: string;
  historicalPaid: string;
  payments: Payment[];
}

interface Account {
  openingBalance: string;
  openingBalanceDate: string;
  currentBalance: string;
}

interface Dashboard {
  accounts: Array<{ uuid: string; actualBalance: string }>;
  balances: { actual: string; available: string };
  creditCards: {
    outstanding: string;
    invoices: Array<{ referenceMonth: string; status: string }>;
  };
}

interface Wallet {
  agent: AuthAgent;
  bank: string;
  invoices: string[];
}

const OPENING = '2025-12-01';

function dataOf<T>(response: { body: unknown }): T {
  return (response.body as { data: T }).data;
}

const uuidOf = (response: { body: unknown }): string =>
  dataOf<{ uuid: string }>(response).uuid;

// Dates are fixed in the past: the account opens on December 1, 2025, with a card
// purchase from September whose first invoices were paid before tracking began.
describe('Historical invoice settlements (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.THROTTLE_LIMIT = '100000';
    process.env.AUTH_THROTTLE_LIMIT = '100000';
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function newWallet(): Promise<Wallet> {
    const agent = await createAuthAgent(app, await createIsolatedUser(app));

    const bank = uuidOf(
      await agent
        .post('/api/accounts')
        .send({
          name: 'Bank',
          type: 'CHECKING',
          openingBalance: '1000.00',
          openingBalanceDate: OPENING,
        })
        .expect(201),
    );

    const category = uuidOf(
      await agent
        .post('/api/transaction-categories')
        .send({ name: 'Market', kind: 'EXPENSE' })
        .expect(201),
    );

    const card = uuidOf(
      await agent
        .post('/api/credit-cards')
        .send({
          name: 'Visa',
          creditLimit: '5000.00',
          closingDay: 5,
          dueDay: 12,
        })
        .expect(201),
    );

    const purchase = dataOf<{ installments: Installment[] }>(
      await agent
        .post('/api/credit-card-purchases')
        .send({
          cardUuid: card,
          categoryUuid: category,
          description: 'Sofa',
          amount: '400.00',
          purchaseDate: '2025-09-20',
          installmentCount: 4,
        })
        .expect(201),
    );

    return {
      agent,
      bank,
      invoices: purchase.installments.map(({ invoice }) => invoice.uuid),
    };
  }

  function settle(
    wallet: Wallet,
    invoice: string,
    body: Record<string, unknown> = {},
  ) {
    return wallet.agent
      .post(`/api/credit-card-invoices/${invoice}/historical-settlements`)
      .send({
        accountUuid: wallet.bank,
        amount: '100.00',
        paidOn: '2025-10-12',
        ...body,
      });
  }

  async function invoiceOf(wallet: Wallet, invoice: string): Promise<Invoice> {
    return dataOf<Invoice>(
      await wallet.agent
        .get(`/api/credit-card-invoices/${invoice}`)
        .expect(200),
    );
  }

  async function accountOf(wallet: Wallet): Promise<Account> {
    return dataOf<Account>(
      await wallet.agent.get(`/api/accounts/${wallet.bank}`).expect(200),
    );
  }

  async function dashboardOf(
    wallet: Wallet,
    year: number,
    month: number,
  ): Promise<Dashboard> {
    return dataOf<Dashboard>(
      await wallet.agent
        .get(`/api/dashboard?year=${year}&month=${month}`)
        .expect(200),
    );
  }

  it('marks old invoices as paid without changing the account', async () => {
    const wallet = await newWallet();
    const [october, november, december, january] = wallet.invoices;

    const before = await dashboardOf(wallet, 2025, 12);

    expect(before.creditCards.outstanding).toBe('300.00');
    expect(before.balances.available).toBe('700.00');

    const settlement = dataOf<Payment>(
      await settle(wallet, october).expect(201),
    );

    expect(settlement.source).toBe('HISTORICAL_SETTLEMENT');
    expect(settlement.sourceLabel).toEqual(expect.any(String));

    await settle(wallet, november, { paidOn: '2025-11-12' }).expect(201);

    await expect(invoiceOf(wallet, october)).resolves.toMatchObject({
      paid: '100.00',
      outstanding: '0.00',
      status: 'PAID',
      historicalPaid: '100.00',
    });

    await expect(accountOf(wallet)).resolves.toMatchObject({
      openingBalance: '1000.00',
      openingBalanceDate: OPENING,
      currentBalance: '1000.00',
    });

    const after = await dashboardOf(wallet, 2025, 12);

    expect(after.accounts[0].actualBalance).toBe('1000.00');
    expect(after.balances.actual).toBe('1000.00');
    expect(after.balances.available).toBe('900.00');
    expect(after.creditCards.outstanding).toBe('100.00');
    expect(
      after.creditCards.invoices.map(({ referenceMonth }) => referenceMonth),
    ).toEqual(['2025-12-01']);

    await expect(invoiceOf(wallet, december)).resolves.toMatchObject({
      outstanding: '100.00',
    });
    await expect(invoiceOf(wallet, january)).resolves.toMatchObject({
      outstanding: '100.00',
    });
  });

  it('keeps partial settlements and normal payments apart', async () => {
    const wallet = await newWallet();
    const [october, , december] = wallet.invoices;

    await settle(wallet, october, { amount: '40.00' }).expect(201);

    await expect(invoiceOf(wallet, october)).resolves.toMatchObject({
      paid: '40.00',
      outstanding: '60.00',
      status: 'OVERDUE',
    });

    await wallet.agent
      .post(`/api/credit-card-invoices/${december}/payments`)
      .send({
        accountUuid: wallet.bank,
        amount: '100.00',
        paidOn: '2025-12-10',
      })
      .expect(201);

    const invoice = await invoiceOf(wallet, december);

    expect(invoice.payments.map(({ source }) => source)).toEqual(['ACCOUNT']);
    expect(invoice.historicalPaid).toBe('0.00');

    await expect(accountOf(wallet)).resolves.toMatchObject({
      currentBalance: '900.00',
    });
  });

  it('still rejects a normal payment before the opening date', async () => {
    const wallet = await newWallet();

    await wallet.agent
      .post(`/api/credit-card-invoices/${wallet.invoices[0]}/payments`)
      .send({
        accountUuid: wallet.bank,
        amount: '100.00',
        paidOn: '2025-10-12',
      })
      .expect(422);
  });

  it('rejects a settlement on or after the opening date', async () => {
    const wallet = await newWallet();
    const [october] = wallet.invoices;

    await settle(wallet, october, { paidOn: OPENING }).expect(422);
    await settle(wallet, october, { paidOn: '2025-12-02' }).expect(422);
  });

  it('rejects amounts above the outstanding', async () => {
    const wallet = await newWallet();
    const [october] = wallet.invoices;

    await settle(wallet, october, { amount: '100.01' }).expect(422);
    await settle(wallet, october).expect(201);
    await settle(wallet, october, {
      amount: '0.01',
      paidOn: '2025-10-13',
    }).expect(422);
  });

  it('rejects the same settlement twice, also concurrently', async () => {
    const wallet = await newWallet();
    const [october, november] = wallet.invoices;

    await settle(wallet, october, { amount: '40.00' }).expect(201);
    await settle(wallet, october, { amount: '40.00' }).expect(409);

    const statuses = (
      await Promise.all([
        settle(wallet, november, { amount: '30.00' }),
        settle(wallet, november, { amount: '30.00' }),
        settle(wallet, november, { amount: '30.00' }),
      ])
    ).map(({ status }) => status);

    expect(statuses.sort()).toEqual([201, 409, 409]);
    await expect(invoiceOf(wallet, november)).resolves.toMatchObject({
      paid: '30.00',
    });
  });

  it('cancels a settlement, which restores the invoice and moves no money', async () => {
    const wallet = await newWallet();
    const [october] = wallet.invoices;

    const settlement = uuidOf(await settle(wallet, october).expect(201));

    const cancel = () =>
      wallet.agent.put(
        `/api/credit-card-invoices/${october}/payments/${settlement}/cancellation`,
      );

    await cancel().expect(200);
    await cancel().expect(409);

    const invoice = await invoiceOf(wallet, october);

    expect(invoice).toMatchObject({
      paid: '0.00',
      outstanding: '100.00',
      status: 'OVERDUE',
      historicalPaid: '0.00',
    });
    expect(invoice.payments).toEqual([
      expect.objectContaining({
        uuid: settlement,
        canceledAt: expect.any(String) as string,
      }),
    ]);

    await expect(accountOf(wallet)).resolves.toMatchObject({
      currentBalance: '1000.00',
    });

    await settle(wallet, october).expect(201);
  });

  it('keeps the opening date after live settlements', async () => {
    const wallet = await newWallet();
    const [october] = wallet.invoices;

    const settlement = uuidOf(await settle(wallet, october).expect(201));

    const moveOpening = (openingBalanceDate: string) =>
      wallet.agent
        .patch(`/api/accounts/${wallet.bank}`)
        .send({ openingBalanceDate });

    await moveOpening('2025-10-12').expect(422);
    await moveOpening('2025-10-13').expect(200);
    await moveOpening('2025-12-15').expect(200);

    await wallet.agent
      .put(
        `/api/credit-card-invoices/${october}/payments/${settlement}/cancellation`,
      )
      .expect(200);

    await moveOpening('2025-09-01').expect(200);
  });

  it('accepts an archived account and answers 404 for foreign records', async () => {
    const wallet = await newWallet();
    const stranger = await newWallet();
    const [october] = wallet.invoices;

    await settle(wallet, october, { accountUuid: stranger.bank }).expect(404);
    await settle(stranger, october, { accountUuid: stranger.bank }).expect(404);

    await wallet.agent
      .put(`/api/accounts/${wallet.bank}/status`)
      .send({ status: 'INACTIVE' })
      .expect(200);

    await settle(wallet, october).expect(201);
  });
});
