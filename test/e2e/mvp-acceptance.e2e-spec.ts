import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  firstDayOf,
  financeToday,
  monthOf,
  shiftMonth,
} from '@shared/domain/calendar';
import {
  ADMIN_CREDENTIALS,
  type AuthAgent,
  createAuthAgent,
} from './helpers/auth-agent';
import { createTestApp } from './helpers/create-test-app';
import { createIsolatedUser } from './helpers/isolated-user';

interface Amounts {
  total: string;
  completed: string;
  pending: string;
}

interface Dashboard {
  balances: { actual: string; projected: string; available: string };
  accounts: Array<{
    uuid: string;
    actualBalance: string;
    projectedBalance: string;
  }>;
  income: Amounts;
  expenses: Amounts;
  expensesByCategory: Array<Amounts & { category: { uuid: string } }>;
  upcoming: Array<{ uuid: string }>;
  creditCards: {
    spending: string;
    planned: string;
    plannedDue: string;
    outstanding: string;
    invoices: Array<{ uuid: string; outstanding: string }>;
    plannedCharges: Array<{ uuid: string; amount: string; overdue: boolean }>;
    plannedChargesCount: number;
  };
  budget: {
    overall: { limit: string; total: string; overspent: string } | null;
    categories: Array<{ overspent: string }>;
  } | null;
  investments: {
    totalValue: string;
    contributions: Amounts;
    items: Array<{ uuid: string; currentValue: string }>;
  };
  spendingGuidance: {
    basis: string;
    remaining: string;
    dailyAllowance: string | null;
  };
}

interface Purchase {
  uuid: string;
  installments: Array<{
    amount: string;
    invoice: { uuid: string; referenceMonth: string };
  }>;
}

interface Occurrence {
  uuid: string;
  invoiceMonth: string | null;
  state: string;
}

interface Ledger {
  agent: AuthAgent;
  bank: string;
  savings: string;
  groceries: string;
  salary: string;
  card: string;
}

function dataOf<T>(response: { body: unknown }): T {
  return (response.body as { data: T }).data;
}

const uuidOf = (response: { body: unknown }): string =>
  dataOf<{ uuid: string }>(response).uuid;

const cents = (amount: string): number => Math.round(Number(amount) * 100);

// One suite per acceptance scenario of the MVP, asserted through the dashboard
// the user actually reads. Each scenario owns a fresh user, so no total depends
// on another. Fixed dates sit in 2030 so they stay in the future; recurring
// charges are generated relative to today and derive their dates from it.
describe('MVP acceptance scenarios (e2e)', () => {
  let app: INestApplication<App>;
  let admin: AuthAgent;

  // Every scenario signs in a user of its own and the privacy matrix sweeps the
  // financial routes twice, well past the default rate limits.
  beforeAll(async () => {
    process.env.THROTTLE_LIMIT = '100000';
    process.env.AUTH_THROTTLE_LIMIT = '100000';
    app = await createTestApp();
    admin = await createAuthAgent(app, ADMIN_CREDENTIALS);
  });

  afterAll(async () => {
    await app.close();
  });

  async function newLedger(): Promise<Ledger> {
    const agent = await createAuthAgent(app, await createIsolatedUser(app));

    const account = (name: string, openingBalance: string) =>
      agent
        .post('/api/accounts')
        .send({
          name,
          type: 'CHECKING',
          openingBalance,
          openingBalanceDate: '2025-01-01',
        })
        .expect(201);

    const category = (name: string, kind: string) =>
      agent
        .post('/api/transaction-categories')
        .send({ name, kind })
        .expect(201);

    return {
      agent,
      bank: uuidOf(await account('Bank', '1000.00')),
      savings: uuidOf(await account('Savings', '500.00')),
      groceries: uuidOf(await category('Market', 'EXPENSE')),
      salary: uuidOf(await category('Pay', 'INCOME')),
      card: uuidOf(
        await agent
          .post('/api/credit-cards')
          .send({
            name: 'Visa',
            creditLimit: '5000.00',
            closingDay: 5,
            dueDay: 12,
          })
          .expect(201),
      ),
    };
  }

  async function dashboardOf(
    { agent }: Ledger,
    year: number,
    month: number,
    perspective = 'PURCHASE_DATE',
  ): Promise<Dashboard> {
    return dataOf<Dashboard>(
      await agent
        .get(
          `/api/dashboard?year=${year}&month=${month}&perspective=${perspective}`,
        )
        .expect(200),
    );
  }

  async function currentBalance(
    { agent }: Ledger,
    account: string,
  ): Promise<string> {
    return dataOf<{ currentBalance: string }>(
      await agent.get(`/api/accounts/${account}`).expect(200),
    ).currentBalance;
  }

  function expense(ledger: Ledger, body: Record<string, unknown>) {
    return ledger.agent
      .post('/api/transactions')
      .send({
        type: 'EXPENSE',
        description: 'Market',
        amount: '100.00',
        date: '2030-03-10',
        state: 'PLANNED',
        accountUuid: ledger.bank,
        categoryUuid: ledger.groceries,
        ...body,
      })
      .expect(201);
  }

  async function buy(
    ledger: Ledger,
    body: Record<string, unknown>,
  ): Promise<Purchase> {
    return dataOf<Purchase>(
      await ledger.agent
        .post('/api/credit-card-purchases')
        .send({
          cardUuid: ledger.card,
          categoryUuid: ledger.groceries,
          description: 'Card purchase',
          amount: '300.00',
          purchaseDate: '2030-10-29',
          installmentCount: 1,
          ...body,
        })
        .expect(201),
    );
  }

  function expectTotalsToAgree(summary: Dashboard): void {
    expect(
      summary.expensesByCategory.reduce(
        (total, entry) => total + cents(entry.total),
        0,
      ),
    ).toBe(cents(summary.expenses.total));
    expect(
      summary.accounts.reduce(
        (total, account) => total + cents(account.actualBalance),
        0,
      ),
    ).toBe(cents(summary.balances.actual));
    expect(
      summary.accounts.reduce(
        (total, account) => total + cents(account.projectedBalance),
        0,
      ),
    ).toBe(cents(summary.balances.projected));
    expect(cents(summary.balances.available)).toBe(
      cents(summary.balances.projected) -
        cents(summary.creditCards.outstanding) -
        cents(summary.creditCards.plannedDue),
    );
  }

  it('keeps the actual balance unchanged by a planned expense until its payment is confirmed', async () => {
    const ledger = await newLedger();
    const planned = uuidOf(await expense(ledger, {}));

    const before = await dashboardOf(ledger, 2030, 3);

    expect(before.balances).toMatchObject({
      actual: '1500.00',
      projected: '1400.00',
    });
    expect(before.expenses).toEqual({
      total: '100.00',
      completed: '0.00',
      pending: '100.00',
    });
    expectTotalsToAgree(before);
    await expect(currentBalance(ledger, ledger.bank)).resolves.toBe('1000.00');

    await ledger.agent
      .put(`/api/transactions/${planned}/state`)
      .send({ state: 'COMPLETED', completedOn: '2030-03-10' })
      .expect(200);

    const after = await dashboardOf(ledger, 2030, 3);

    expect(after.balances).toMatchObject({
      actual: '1400.00',
      projected: '1400.00',
    });
    expect(after.expenses).toEqual({
      total: '100.00',
      completed: '100.00',
      pending: '0.00',
    });
    expectTotalsToAgree(after);
    await expect(currentBalance(ledger, ledger.bank)).resolves.toBe('900.00');
  });

  it('does not show a transfer between own accounts as spending', async () => {
    const ledger = await newLedger();

    await ledger.agent
      .post('/api/transactions')
      .send({
        type: 'TRANSFER',
        description: 'To savings',
        amount: '250.00',
        date: '2030-03-10',
        state: 'COMPLETED',
        accountUuid: ledger.bank,
        destinationAccountUuid: ledger.savings,
      })
      .expect(201);

    const summary = await dashboardOf(ledger, 2030, 3);

    expect(summary.expenses.total).toBe('0.00');
    expect(summary.income.total).toBe('0.00');
    expect(summary.expensesByCategory).toEqual([]);
    expect(summary.balances.actual).toBe('1500.00');
    await expect(currentBalance(ledger, ledger.bank)).resolves.toBe('750.00');
    await expect(currentBalance(ledger, ledger.savings)).resolves.toBe(
      '750.00',
    );
    expectTotalsToAgree(summary);
  });

  it('shows an October purchase on the November invoice and does not count it again when paid', async () => {
    const ledger = await newLedger();
    const purchase = await buy(ledger, {});
    const [{ invoice }] = purchase.installments;

    expect(invoice.referenceMonth).toBe('2030-11-01');

    const october = await dashboardOf(ledger, 2030, 10);
    const novemberByPurchase = await dashboardOf(ledger, 2030, 11);

    const novemberByInvoice = await dashboardOf(
      ledger,
      2030,
      11,
      'INVOICE_MONTH',
    );

    const octoberByInvoice = await dashboardOf(
      ledger,
      2030,
      10,
      'INVOICE_MONTH',
    );

    expect(october.expenses.total).toBe('300.00');
    expect(novemberByPurchase.expenses.total).toBe('0.00');
    expect(octoberByInvoice.expenses.total).toBe('0.00');
    expect(novemberByInvoice.expenses.total).toBe('300.00');
    expect(novemberByInvoice.balances.actual).toBe('1500.00');
    expect(novemberByInvoice.balances.available).toBe('1200.00');
    expect(novemberByPurchase.balances).toEqual(novemberByInvoice.balances);

    await ledger.agent
      .post(`/api/credit-card-invoices/${invoice.uuid}/payments`)
      .send({
        accountUuid: ledger.bank,
        amount: '300.00',
        paidOn: '2030-11-10',
      })
      .expect(201);

    const paid = await dashboardOf(ledger, 2030, 11, 'INVOICE_MONTH');

    expect(paid.expenses).toEqual({
      total: '300.00',
      completed: '300.00',
      pending: '0.00',
    });
    expect(paid.creditCards.outstanding).toBe('0.00');
    expect(paid.balances).toMatchObject({
      actual: '1200.00',
      available: '1200.00',
    });
    await expect(currentBalance(ledger, ledger.bank)).resolves.toBe('700.00');
    expectTotalsToAgree(paid);
  });

  it('creates three correctly valued obligations across consecutive invoices', async () => {
    const ledger = await newLedger();

    const { installments } = await buy(ledger, {
      amount: '100.00',
      installmentCount: 3,
    });

    expect(
      installments.map(({ amount, invoice }) => [
        amount,
        invoice.referenceMonth,
      ]),
    ).toEqual([
      ['33.34', '2030-11-01'],
      ['33.33', '2030-12-01'],
      ['33.33', '2031-01-01'],
    ]);

    const spending: string[] = [];

    for (const [year, month] of [
      [2030, 11],
      [2030, 12],
      [2031, 1],
    ]) {
      const summary = await dashboardOf(ledger, year, month, 'INVOICE_MONTH');

      expectTotalsToAgree(summary);
      spending.push(summary.creditCards.spending);
    }

    expect(spending).toEqual(['33.34', '33.33', '33.33']);

    const last = await dashboardOf(ledger, 2031, 1, 'INVOICE_MONTH');

    expect(last.creditCards.outstanding).toBe('100.00');
  });

  it('ends a subscription from an invoice without deleting earlier charges or generating later ones', async () => {
    const ledger = await newLedger();
    const thisMonth = monthOf(financeToday());
    const firstInvoice = shiftMonth(thisMonth, 1);
    const cut = shiftMonth(thisMonth, 3);

    const recurrence = uuidOf(
      await ledger.agent
        .post('/api/recurrences')
        .send({
          type: 'EXPENSE',
          description: 'Netflix',
          amount: '55.90',
          frequency: 'MONTHLY',
          startDate: `${firstDayOf(thisMonth).slice(0, 8)}15`,
          creditCardUuid: ledger.card,
          categoryUuid: ledger.groceries,
        })
        .expect(201),
    );

    const occurrences = async (): Promise<Occurrence[]> =>
      dataOf<Occurrence[]>(
        await ledger.agent
          .get(`/api/recurrences/${recurrence}/occurrences?limit=50`)
          .expect(200),
      );

    const [first] = await occurrences();

    await ledger.agent
      .put(
        `/api/recurrences/${recurrence}/occurrences/${first.uuid}/confirmation`,
      )
      .send({})
      .expect(200);

    await ledger.agent
      .put(`/api/recurrences/${recurrence}/end`)
      .send({ fromInvoiceMonth: firstDayOf(cut) })
      .expect(200);

    expect((await occurrences()).map((o) => [o.invoiceMonth, o.state])).toEqual(
      [
        [firstDayOf(firstInvoice), 'COMPLETED'],
        [firstDayOf(shiftMonth(thisMonth, 2)), 'PLANNED'],
      ],
    );

    const atCut = await dashboardOf(
      ledger,
      cut.year,
      cut.month,
      'INVOICE_MONTH',
    );

    expect(atCut.creditCards.planned).toBe('0.00');
    expect(atCut.creditCards.plannedDue).toBe('55.90');
    expect(atCut.creditCards.plannedChargesCount).toBe(1);
    expect(atCut.creditCards.outstanding).toBe('55.90');
    expectTotalsToAgree(atCut);
  });

  it('counts an unconfirmed charge of an earlier month in later months, whatever the perspective', async () => {
    const ledger = await newLedger();
    const thisMonth = monthOf(financeToday());
    const later = shiftMonth(thisMonth, 4);

    await ledger.agent
      .post('/api/recurrences')
      .send({
        type: 'EXPENSE',
        description: 'Gym',
        amount: '10.00',
        frequency: 'MONTHLY',
        startDate: `${firstDayOf(thisMonth).slice(0, 8)}15`,
        creditCardUuid: ledger.card,
        categoryUuid: ledger.groceries,
      })
      .expect(201);

    const byPurchase = await dashboardOf(ledger, later.year, later.month);

    const byInvoice = await dashboardOf(
      ledger,
      later.year,
      later.month,
      'INVOICE_MONTH',
    );

    // Charges on the 15th fall on the next month's invoice, so the month four
    // months ahead has the invoices one to four ahead expecting a charge each.
    expect(byPurchase.creditCards.plannedDue).toBe('40.00');
    expect(byInvoice.creditCards.plannedDue).toBe('40.00');
    expect(byPurchase.balances).toEqual(byInvoice.balances);
    expect(byPurchase.balances.available).toBe('1460.00');
    expect(byInvoice.creditCards.plannedCharges).toHaveLength(4);
  });

  it('saves a transaction above a monthly and a category budget and only reports the overspending', async () => {
    const ledger = await newLedger();

    await ledger.agent
      .put('/api/budgets/2030/3')
      .send({
        totalLimit: '100.00',
        categoryLimits: [{ categoryUuid: ledger.groceries, limit: '50.00' }],
      })
      .expect(200);

    await expense(ledger, { amount: '150.00', state: 'COMPLETED' });

    const summary = await dashboardOf(ledger, 2030, 3);

    expect(summary.budget?.overall).toMatchObject({ overspent: '50.00' });
    expect(summary.budget?.categories[0]).toMatchObject({
      overspent: '100.00',
    });
    expect(summary.spendingGuidance).toMatchObject({
      remaining: '0.00',
      dailyAllowance: '0.00',
    });
    expect(summary.balances.actual).toBe('1350.00');
    expectTotalsToAgree(summary);
  });

  it('moves a contribution from the account into the investment without increasing spending', async () => {
    const ledger = await newLedger();

    const reserve = uuidOf(
      await ledger.agent
        .post('/api/investments')
        .send({ name: 'Reserve', type: 'RESERVE' })
        .expect(201),
    );

    await ledger.agent
      .post(`/api/investments/${reserve}/movements`)
      .send({
        type: 'CONTRIBUTION',
        accountUuid: ledger.bank,
        amount: '300.00',
        date: '2030-03-05',
        state: 'COMPLETED',
      })
      .expect(201);

    const summary = await dashboardOf(ledger, 2030, 3);

    expect(summary.expenses.total).toBe('0.00');
    expect(summary.income.total).toBe('0.00');
    expect(summary.balances.actual).toBe('1200.00');
    expect(summary.investments).toMatchObject({
      totalValue: '300.00',
      contributions: { completed: '300.00' },
      items: [{ uuid: reserve, currentValue: '300.00' }],
    });
    await expect(currentBalance(ledger, ledger.bank)).resolves.toBe('700.00');
    expectTotalsToAgree(summary);
  });

  it('keeps the money set aside by a planned contribution out of what is left in the budget', async () => {
    const ledger = await newLedger();

    const reserve = uuidOf(
      await ledger.agent
        .post('/api/investments')
        .send({ name: 'Reserve', type: 'RESERVE' })
        .expect(201),
    );

    await ledger.agent
      .post(`/api/investments/${reserve}/movements`)
      .send({
        type: 'CONTRIBUTION',
        accountUuid: ledger.bank,
        amount: '1400.00',
        date: '2030-03-05',
        state: 'PLANNED',
      })
      .expect(201);

    await ledger.agent
      .put('/api/budgets/2030/3')
      .send({ totalLimit: '310.00', categoryLimits: [] })
      .expect(200);

    const summary = await dashboardOf(ledger, 2030, 3);

    expect(summary.balances.available).toBe('100.00');
    expect(summary.expenses.total).toBe('0.00');
    expect(summary.spendingGuidance).toEqual({
      basis: 'BALANCE',
      remaining: '100.00',
      dailyAllowance: '3.22',
    });
  });

  it('reports a negative available balance without suggesting a negative allowance', async () => {
    const ledger = await newLedger();

    await expense(ledger, { amount: '2000.00', state: 'COMPLETED' });

    const summary = await dashboardOf(ledger, 2030, 3);

    expect(summary.balances.available).toBe('-500.00');
    expect(summary.spendingGuidance).toEqual({
      basis: 'BALANCE',
      remaining: '0.00',
      dailyAllowance: '0.00',
    });
    expectTotalsToAgree(summary);
  });

  describe("user A's records, as seen by user B", () => {
    let owner: Ledger;
    let category: string;
    let transaction: string;
    let purchase: Purchase;
    let refund: string;
    let payment: string;
    let recurrence: string;
    let occurrence: string;
    let investment: string;
    let movement: string;
    let peer: AuthAgent;
    let visitors: Array<[string, AuthAgent]>;

    beforeAll(async () => {
      owner = await newLedger();
      peer = await createAuthAgent(app, await createIsolatedUser(app));
      visitors = [
        ['another user', peer],
        ['an admin', admin],
      ];

      category = owner.groceries;
      transaction = uuidOf(await expense(owner, { description: 'Private' }));
      purchase = await buy(owner, { description: 'Private purchase' });

      refund = uuidOf(
        await owner.agent
          .post(`/api/credit-card-purchases/${purchase.uuid}/refunds`)
          .send({ amount: '1.00', date: '2030-10-30' })
          .expect(201),
      );

      payment = uuidOf(
        await owner.agent
          .post(
            `/api/credit-card-invoices/${purchase.installments[0].invoice.uuid}/payments`,
          )
          .send({ accountUuid: owner.bank, amount: '1.00' })
          .expect(201),
      );

      recurrence = uuidOf(
        await owner.agent
          .post('/api/recurrences')
          .send({
            type: 'EXPENSE',
            description: 'Private rent',
            amount: '10.00',
            frequency: 'MONTHLY',
            startDate: financeToday(),
            accountUuid: owner.bank,
            categoryUuid: category,
          })
          .expect(201),
      );

      occurrence = dataOf<Occurrence[]>(
        await owner.agent
          .get(`/api/recurrences/${recurrence}/occurrences`)
          .expect(200),
      )[0].uuid;

      investment = uuidOf(
        await owner.agent
          .post('/api/investments')
          .send({ name: 'Private reserve', type: 'RESERVE' })
          .expect(201),
      );

      movement = uuidOf(
        await owner.agent
          .post(`/api/investments/${investment}/movements`)
          .send({
            type: 'CONTRIBUTION',
            accountUuid: owner.bank,
            amount: '1.00',
            date: '2030-03-05',
            state: 'PLANNED',
          })
          .expect(201),
      );
    });

    const invoiceOf = () => purchase.installments[0].invoice.uuid;

    const foreignRoutes: Array<
      [string, (agent: AuthAgent) => ReturnType<AuthAgent['get']>]
    > = [
      ['GET account', (a) => a.get(`/api/accounts/${owner.bank}`)],
      [
        'PATCH account',
        (a) => a.patch(`/api/accounts/${owner.bank}`).send({ name: 'X' }),
      ],
      [
        'PUT account status',
        (a) =>
          a
            .put(`/api/accounts/${owner.bank}/status`)
            .send({ status: 'INACTIVE' }),
      ],
      ['DELETE account', (a) => a.delete(`/api/accounts/${owner.bank}`)],
      ['GET category', (a) => a.get(`/api/transaction-categories/${category}`)],
      [
        'PATCH category',
        (a) =>
          a
            .patch(`/api/transaction-categories/${category}`)
            .send({ name: 'X' }),
      ],
      [
        'DELETE category',
        (a) => a.delete(`/api/transaction-categories/${category}`),
      ],
      ['GET transaction', (a) => a.get(`/api/transactions/${transaction}`)],
      [
        'PATCH transaction',
        (a) =>
          a
            .patch(`/api/transactions/${transaction}`)
            .send({ description: 'X' }),
      ],
      [
        'PUT transaction state',
        (a) =>
          a
            .put(`/api/transactions/${transaction}/state`)
            .send({ state: 'COMPLETED' }),
      ],
      [
        'DELETE transaction',
        (a) => a.delete(`/api/transactions/${transaction}`),
      ],
      ['GET card', (a) => a.get(`/api/credit-cards/${owner.card}`)],
      [
        'GET card invoices',
        (a) => a.get(`/api/credit-cards/${owner.card}/invoices`),
      ],
      [
        'PATCH card',
        (a) => a.patch(`/api/credit-cards/${owner.card}`).send({ name: 'X' }),
      ],
      [
        'PUT card status',
        (a) =>
          a
            .put(`/api/credit-cards/${owner.card}/status`)
            .send({ status: 'INACTIVE' }),
      ],
      ['DELETE card', (a) => a.delete(`/api/credit-cards/${owner.card}`)],
      ['GET invoice', (a) => a.get(`/api/credit-card-invoices/${invoiceOf()}`)],
      [
        'PUT payment cancellation',
        (a) =>
          a.put(
            `/api/credit-card-invoices/${invoiceOf()}/payments/${payment}/cancellation`,
          ),
      ],
      [
        'GET purchase',
        (a) => a.get(`/api/credit-card-purchases/${purchase.uuid}`),
      ],
      [
        'PATCH purchase',
        (a) =>
          a
            .patch(`/api/credit-card-purchases/${purchase.uuid}`)
            .send({ description: 'X' }),
      ],
      [
        'POST refund',
        (a) =>
          a
            .post(`/api/credit-card-purchases/${purchase.uuid}/refunds`)
            .send({ amount: '1.00', date: '2030-10-30' }),
      ],
      [
        'DELETE refund',
        (a) =>
          a.delete(
            `/api/credit-card-purchases/${purchase.uuid}/refunds/${refund}`,
          ),
      ],
      [
        'DELETE purchase',
        (a) => a.delete(`/api/credit-card-purchases/${purchase.uuid}`),
      ],
      ['GET recurrence', (a) => a.get(`/api/recurrences/${recurrence}`)],
      [
        'PATCH recurrence',
        (a) =>
          a
            .patch(`/api/recurrences/${recurrence}`)
            .send({ scope: 'ALL', amount: '1.00' }),
      ],
      [
        'PUT recurrence state',
        (a) =>
          a
            .put(`/api/recurrences/${recurrence}/state`)
            .send({ state: 'PAUSED' }),
      ],
      [
        'PUT recurrence end',
        (a) => a.put(`/api/recurrences/${recurrence}/end`).send({}),
      ],
      [
        'GET occurrences',
        (a) => a.get(`/api/recurrences/${recurrence}/occurrences`),
      ],
      [
        'PATCH occurrence',
        (a) =>
          a
            .patch(`/api/recurrences/${recurrence}/occurrences/${occurrence}`)
            .send({ amount: '1.00' }),
      ],
      [
        'PUT occurrence confirmation',
        (a) =>
          a
            .put(
              `/api/recurrences/${recurrence}/occurrences/${occurrence}/confirmation`,
            )
            .send({}),
      ],
      [
        'PUT occurrence cancellation',
        (a) =>
          a.put(
            `/api/recurrences/${recurrence}/occurrences/${occurrence}/cancellation`,
          ),
      ],
      ['GET investment', (a) => a.get(`/api/investments/${investment}`)],
      [
        'PATCH investment',
        (a) => a.patch(`/api/investments/${investment}`).send({ name: 'X' }),
      ],
      [
        'PUT investment status',
        (a) =>
          a
            .put(`/api/investments/${investment}/status`)
            .send({ status: 'INACTIVE' }),
      ],
      ['DELETE investment', (a) => a.delete(`/api/investments/${investment}`)],
      [
        'GET movements',
        (a) => a.get(`/api/investments/${investment}/movements`),
      ],
      [
        'POST valuation',
        (a) =>
          a
            .post(`/api/investments/${investment}/valuations`)
            .send({ value: '5.00' }),
      ],
      [
        'PUT movement state',
        (a) =>
          a
            .put(`/api/investments/${investment}/movements/${movement}/state`)
            .send({ state: 'COMPLETED' }),
      ],
    ];

    it.each(foreignRoutes)('answers 404 to %s', async (_, send) => {
      for (const [, visitor] of visitors) {
        await send(visitor).expect(404);
      }
    });

    it('refuses references to the records of another user in new records', async () => {
      for (const [, visitor] of visitors) {
        const own = uuidOf(
          await visitor
            .post('/api/accounts')
            .send({
              name: `Own ${randomUUID()}`,
              type: 'CHECKING',
              openingBalance: '10.00',
              openingBalanceDate: '2025-01-01',
            })
            .expect(201),
        );

        const ownInvestment = uuidOf(
          await visitor
            .post('/api/investments')
            .send({ name: `Own ${randomUUID()}`, type: 'RESERVE' })
            .expect(201),
        );

        const ownCategory = uuidOf(
          await visitor
            .post('/api/transaction-categories')
            .send({ name: `Own ${randomUUID()}`, kind: 'EXPENSE' })
            .expect(201),
        );

        const references: Array<() => ReturnType<AuthAgent['post']>> = [
          () =>
            visitor.post('/api/transactions').send({
              type: 'EXPENSE',
              description: 'Sneaky',
              amount: '1.00',
              date: '2030-03-10',
              state: 'PLANNED',
              accountUuid: own,
              categoryUuid: category,
            }),
          () =>
            visitor.post('/api/transactions').send({
              type: 'TRANSFER',
              description: 'Sneaky',
              amount: '1.00',
              date: '2030-03-10',
              state: 'PLANNED',
              accountUuid: own,
              destinationAccountUuid: owner.bank,
            }),
          () =>
            visitor.post('/api/credit-card-purchases').send({
              cardUuid: owner.card,
              categoryUuid: ownCategory,
              description: 'Sneaky',
              amount: '1.00',
              purchaseDate: '2030-03-10',
              installmentCount: 1,
            }),
          () =>
            visitor.post('/api/recurrences').send({
              type: 'EXPENSE',
              description: 'Sneaky',
              amount: '1.00',
              frequency: 'MONTHLY',
              startDate: financeToday(),
              creditCardUuid: owner.card,
              categoryUuid: ownCategory,
            }),
          () =>
            visitor.post(`/api/investments/${ownInvestment}/movements`).send({
              type: 'CONTRIBUTION',
              accountUuid: owner.bank,
              amount: '1.00',
              date: '2030-03-05',
              state: 'PLANNED',
            }),
        ];

        for (const reference of references) {
          await reference().expect(404);
        }

        await visitor
          .put('/api/budgets/2030/3')
          .send({
            totalLimit: null,
            categoryLimits: [{ categoryUuid: category, limit: '1.00' }],
          })
          .expect(404);
      }
    });

    it('leaves every list and dashboard of the other users without the records', async () => {
      const serializedOwner = [
        owner.bank,
        owner.savings,
        owner.card,
        category,
        transaction,
        purchase.uuid,
        recurrence,
        investment,
      ];

      for (const [, visitor] of visitors) {
        const bodies: string[] = [];

        for (const path of [
          '/api/accounts',
          '/api/transaction-categories',
          '/api/transactions',
          '/api/credit-cards',
          '/api/credit-card-purchases',
          '/api/recurrences',
          '/api/investments',
          '/api/budgets/2030/3',
          '/api/dashboard?year=2030&month=3',
          '/api/dashboard?year=2030&month=11',
        ]) {
          bodies.push(
            JSON.stringify((await visitor.get(path).expect(200)).body),
          );
        }

        for (const uuid of serializedOwner) {
          expect(bodies.join()).not.toContain(uuid);
        }
      }
    });

    it("leaves the owner's figures untouched", async () => {
      const summary = await dashboardOf(owner, 2030, 3);

      const stored = await owner.agent
        .get(`/api/transactions/${transaction}`)
        .expect(200);

      expect(dataOf<{ state: string }>(stored).state).toBe('PLANNED');
      expect(summary.accounts.map(({ uuid }) => uuid)).toEqual(
        expect.arrayContaining([owner.bank, owner.savings]),
      );
      await expect(currentBalance(owner, owner.bank)).resolves.toBe('999.00');
    });
  });
});
