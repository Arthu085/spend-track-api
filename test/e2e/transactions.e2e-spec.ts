import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { type AuthAgent, createAuthAgent } from './helpers/auth-agent';
import { createTestApp } from './helpers/create-test-app';
import { createIsolatedUser } from './helpers/isolated-user';

interface EnvelopeBody<T> {
  data: T;
  meta?: { total: number; page: number; limit: number };
}

interface AccountShape {
  uuid: string;
  currentBalance: string;
}

interface TransactionShape {
  uuid: string;
  type: string;
  typeLabel: string;
  state: string;
  stateLabel: string;
  amount: string;
  completedOn: string | null;
  canceledAt: string | null;
  account: { uuid: string; name: string; status: string };
  destinationAccount: { uuid: string } | null;
  category: { uuid: string; name: string; status: string } | null;
  notes: string | null;
}

interface AmountsShape {
  total: string;
  completed: string;
  pending: string;
}

interface DashboardShape {
  balances: { actual: string; projected: string };
  accounts: Array<{
    uuid: string;
    actualBalance: string;
    projectedBalance: string;
  }>;
  income: AmountsShape;
  expenses: AmountsShape;
  expensesByCategory: Array<AmountsShape & { category: { uuid: string } }>;
  upcoming: Array<{ uuid: string; overdue: boolean }>;
  upcomingCount: number;
}

function dataOf<T>(body: unknown): T {
  return (body as EnvelopeBody<T>).data;
}

function cents(amount: string): number {
  const [whole, fraction = '0'] = amount.replace('-', '').split('.');
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  return amount.startsWith('-') ? -value : value;
}

// Every scenario works on accounts and categories of its own. Login is
// throttled, so scenarios share one isolated user, except those that read
// user-wide dashboard totals, which sign in as a user of their own.
describe('Transactions (e2e)', () => {
  let app: INestApplication<App>;
  let shared: AuthAgent;

  beforeAll(async () => {
    app = await createTestApp();
    shared = await newAgent();
  });

  afterAll(async () => {
    await app.close();
  });

  interface Ledger {
    agent: AuthAgent;
    bank: string;
    wallet: string;
    groceries: string;
    salary: string;
  }

  async function newAgent(): Promise<AuthAgent> {
    return createAuthAgent(app, await createIsolatedUser(app));
  }

  async function newLedger(agent: AuthAgent = shared): Promise<Ledger> {
    const account = async (name: string, openingBalance: string) =>
      dataOf<AccountShape>(
        (
          await agent
            .post('/api/accounts')
            .send({
              name,
              type: 'CHECKING',
              openingBalance,
              openingBalanceDate: '2026-01-01',
            })
            .expect(201)
        ).body,
      ).uuid;

    const category = async (name: string, kind: string) =>
      dataOf<{ uuid: string }>(
        (
          await agent
            .post('/api/transaction-categories')
            .send({ name, kind })
            .expect(201)
        ).body,
      ).uuid;

    return {
      agent,
      bank: await account('Bank', '1000.00'),
      wallet: await account('Wallet', '50.00'),
      groceries: await category('Groceries', 'EXPENSE'),
      salary: await category('Salary', 'INCOME'),
    };
  }

  async function record(
    ledger: Ledger,
    body: Record<string, unknown>,
  ): Promise<TransactionShape> {
    const response = await ledger.agent
      .post('/api/transactions')
      .send({
        type: 'EXPENSE',
        description: 'Market',
        amount: '100.00',
        date: '2026-10-10',
        state: 'PLANNED',
        accountUuid: ledger.bank,
        categoryUuid: ledger.groceries,
        ...body,
      })
      .expect(201);

    return dataOf<TransactionShape>(response.body);
  }

  async function balanceOf(ledger: Ledger, account: string): Promise<string> {
    const response = await ledger.agent
      .get(`/api/accounts/${account}`)
      .expect(200);

    return dataOf<AccountShape>(response.body).currentBalance;
  }

  async function dashboard(ledger: Ledger): Promise<DashboardShape> {
    const response = await ledger.agent
      .get('/api/dashboard?year=2026&month=10')
      .expect(200);

    return dataOf<DashboardShape>(response.body);
  }

  it('leaves the actual balance unchanged by a planned expense until it is completed, exactly once', async () => {
    const ledger = await newLedger();
    const planned = await record(ledger, {});

    expect(planned).toMatchObject({
      state: 'PLANNED',
      stateLabel: 'Prevista',
      typeLabel: 'Despesa',
      completedOn: null,
    });
    await expect(balanceOf(ledger, ledger.bank)).resolves.toBe('1000.00');

    const completed = await ledger.agent
      .put(`/api/transactions/${planned.uuid}/state`)
      .send({ state: 'COMPLETED', completedOn: '2026-10-11' })
      .expect(200);

    expect(dataOf<TransactionShape>(completed.body)).toMatchObject({
      state: 'COMPLETED',
      completedOn: '2026-10-11',
    });
    await expect(balanceOf(ledger, ledger.bank)).resolves.toBe('900.00');

    await ledger.agent
      .put(`/api/transactions/${planned.uuid}/state`)
      .send({ state: 'COMPLETED' })
      .expect(409);
    await expect(balanceOf(ledger, ledger.bank)).resolves.toBe('900.00');
  });

  it('completes a transaction once even under concurrent requests', async () => {
    const ledger = await newLedger();
    const planned = await record(ledger, { amount: '10.00' });

    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        ledger.agent
          .put(`/api/transactions/${planned.uuid}/state`)
          .send({ state: 'COMPLETED' }),
      ),
    );

    expect(responses.map(({ status }) => status).sort()).toEqual([
      200, 409, 409, 409,
    ]);
    await expect(balanceOf(ledger, ledger.bank)).resolves.toBe('990.00');
  });

  it('moves money between own accounts without counting it as income or spending', async () => {
    const ledger = await newLedger(await newAgent());

    const transfer = await record(ledger, {
      type: 'TRANSFER',
      amount: '250.50',
      state: 'COMPLETED',
      categoryUuid: undefined,
      destinationAccountUuid: ledger.wallet,
    });

    expect(transfer).toMatchObject({
      typeLabel: 'Transferência',
      category: null,
      completedOn: '2026-10-10',
      destinationAccount: { uuid: ledger.wallet },
    });
    await expect(balanceOf(ledger, ledger.bank)).resolves.toBe('749.50');
    await expect(balanceOf(ledger, ledger.wallet)).resolves.toBe('300.50');

    const summary = await dashboard(ledger);

    expect(summary.balances.actual).toBe('1050.00');
    expect(summary.income.total).toBe('0.00');
    expect(summary.expenses.total).toBe('0.00');
    expect(summary.expensesByCategory).toEqual([]);
  });

  it('rejects a transfer to the same account and a category of the wrong kind', async () => {
    const ledger = await newLedger();

    await ledger.agent
      .post('/api/transactions')
      .send({
        type: 'TRANSFER',
        description: 'Loop',
        amount: '1.00',
        date: '2026-10-10',
        state: 'PLANNED',
        accountUuid: ledger.bank,
        destinationAccountUuid: ledger.bank,
      })
      .expect(422);
    await ledger.agent
      .post('/api/transactions')
      .send({
        type: 'EXPENSE',
        description: 'Wrong kind',
        amount: '1.00',
        date: '2026-10-10',
        state: 'PLANNED',
        accountUuid: ledger.bank,
        categoryUuid: ledger.salary,
      })
      .expect(422);
    await ledger.agent
      .post('/api/transactions')
      .send({
        type: 'TRANSFER',
        description: 'No destination',
        amount: '1.00',
        date: '2026-10-10',
        state: 'PLANNED',
        accountUuid: ledger.bank,
      })
      .expect(400);
  });

  it('reverses the balance effect of a canceled completed transaction and keeps it visible', async () => {
    const ledger = await newLedger();

    const income = await record(ledger, {
      type: 'INCOME',
      amount: '500.00',
      state: 'COMPLETED',
      categoryUuid: ledger.salary,
    });

    await expect(balanceOf(ledger, ledger.bank)).resolves.toBe('1500.00');

    const canceled = await ledger.agent
      .put(`/api/transactions/${income.uuid}/state`)
      .send({ state: 'CANCELED' })
      .expect(200);

    expect(dataOf<TransactionShape>(canceled.body)).toMatchObject({
      state: 'CANCELED',
      completedOn: '2026-10-10',
    });
    expect(dataOf<TransactionShape>(canceled.body).canceledAt).not.toBeNull();
    await expect(balanceOf(ledger, ledger.bank)).resolves.toBe('1000.00');

    const list = await ledger.agent
      .get('/api/transactions?state=CANCELED')
      .expect(200);

    expect(dataOf<TransactionShape[]>(list.body).map((t) => t.uuid)).toEqual([
      income.uuid,
    ]);
    await ledger.agent
      .patch(`/api/transactions/${income.uuid}`)
      .send({ description: 'Edited' })
      .expect(409);
    await ledger.agent
      .put(`/api/transactions/${income.uuid}/state`)
      .send({ state: 'COMPLETED' })
      .expect(409);
    await ledger.agent.delete(`/api/transactions/${income.uuid}`).expect(409);
  });

  it('protects completed history from edits but allows description, category, and notes', async () => {
    const ledger = await newLedger();
    const completed = await record(ledger, { state: 'COMPLETED' });

    await ledger.agent
      .patch(`/api/transactions/${completed.uuid}`)
      .send({ amount: '1.00' })
      .expect(409);

    const pets = dataOf<{ uuid: string }>(
      (
        await ledger.agent
          .post('/api/transaction-categories')
          .send({ name: 'Pets', kind: 'EXPENSE' })
          .expect(201)
      ).body,
    ).uuid;

    const edited = await ledger.agent
      .patch(`/api/transactions/${completed.uuid}`)
      .send({ description: 'Vet', categoryUuid: pets, notes: 'annual' })
      .expect(200);

    expect(dataOf<TransactionShape>(edited.body)).toMatchObject({
      amount: '100.00',
      category: { uuid: pets },
      notes: 'annual',
    });
    await ledger.agent
      .delete(`/api/transactions/${completed.uuid}`)
      .expect(409);
  });

  it('deletes a planned transaction', async () => {
    const ledger = await newLedger();
    const planned = await record(ledger, {});

    await ledger.agent.delete(`/api/transactions/${planned.uuid}`).expect(200);
    await ledger.agent.get(`/api/transactions/${planned.uuid}`).expect(404);
  });

  it('refuses to delete an account with history but lets it be deactivated', async () => {
    const ledger = await newLedger();
    await record(ledger, {
      type: 'TRANSFER',
      categoryUuid: undefined,
      destinationAccountUuid: ledger.wallet,
    });

    await ledger.agent.delete(`/api/accounts/${ledger.wallet}`).expect(409);
    await ledger.agent
      .put(`/api/accounts/${ledger.wallet}/status`)
      .send({ status: 'INACTIVE' })
      .expect(200);

    const list = await ledger.agent
      .get(`/api/transactions?accountUuid=${ledger.wallet}`)
      .expect(200);

    expect(dataOf<TransactionShape[]>(list.body)[0]).toMatchObject({
      destinationAccount: { uuid: ledger.wallet },
    });
  });

  it('keeps showing a deleted category on the transactions that use it', async () => {
    const ledger = await newLedger();
    const expense = await record(ledger, {});

    await ledger.agent
      .delete(`/api/transaction-categories/${ledger.groceries}`)
      .expect(200);

    const response = await ledger.agent
      .get(`/api/transactions/${expense.uuid}`)
      .expect(200);

    expect(dataOf<TransactionShape>(response.body).category).toMatchObject({
      uuid: ledger.groceries,
      name: 'Groceries',
    });
  });

  it('builds dashboard totals that agree with the records', async () => {
    const ledger = await newLedger(await newAgent());
    await record(ledger, {
      type: 'INCOME',
      amount: '3000.00',
      state: 'COMPLETED',
      categoryUuid: ledger.salary,
    });
    await record(ledger, {
      type: 'INCOME',
      amount: '2000.00',
      date: '2026-10-25',
      categoryUuid: ledger.salary,
    });
    await record(ledger, { amount: '300.00', state: 'COMPLETED' });
    await record(ledger, { amount: '200.00', date: '2026-10-28' });
    await record(ledger, {
      amount: '45.25',
      date: '2026-09-20',
      accountUuid: ledger.wallet,
    });
    await record(ledger, { amount: '999.00', date: '2026-11-03' });
    await record(ledger, {
      type: 'TRANSFER',
      amount: '100.00',
      categoryUuid: undefined,
      destinationAccountUuid: ledger.wallet,
    });

    const summary = await dashboard(ledger);

    expect(summary.income).toEqual({
      total: '5000.00',
      completed: '3000.00',
      pending: '2000.00',
    });
    expect(summary.expenses).toEqual({
      total: '500.00',
      completed: '300.00',
      pending: '200.00',
    });
    expect(
      summary.expensesByCategory.reduce(
        (total, entry) => total + cents(entry.total),
        0,
      ),
    ).toBe(cents(summary.expenses.total));

    const bank = summary.accounts.find((entry) => entry.uuid === ledger.bank);

    const wallet = summary.accounts.find(
      (entry) => entry.uuid === ledger.wallet,
    );

    expect(bank).toMatchObject({
      actualBalance: '3700.00',
      projectedBalance: '5400.00',
    });
    expect(wallet).toMatchObject({
      actualBalance: '50.00',
      projectedBalance: '104.75',
    });
    expect(summary.balances).toEqual({
      actual: '3750.00',
      projected: '5504.75',
    });
    expect(summary.upcomingCount).toBe(4);
    expect(summary.upcoming[0]).toMatchObject({ overdue: true });
  });
});
