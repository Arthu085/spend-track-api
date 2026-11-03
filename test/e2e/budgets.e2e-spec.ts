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
}

interface BudgetShape {
  year: number;
  month: number;
  totalLimit: string | null;
  categoryLimits: Array<{ category: { uuid: string }; limit: string }>;
  updatedAt: string | null;
}

interface LimitShape {
  limit: string;
  total: string;
  completed: string;
  pending: string;
  remaining: string;
  overspent: string;
}

interface DashboardShape {
  expenses: { total: string };
  budget: {
    overall: LimitShape | null;
    categories: Array<LimitShape & { category: { uuid: string } }>;
  } | null;
  spendingGuidance: {
    basis: string;
    remaining: string;
    dailyAllowance: string | null;
  };
}

function dataOf<T>(body: unknown): T {
  return (body as EnvelopeBody<T>).data;
}

// A fixed future month keeps the dashboard figures independent of today:
// March 2030 has 31 remaining days.
describe('Budgets (e2e)', () => {
  let app: INestApplication<App>;
  let owner: AuthAgent;
  let admin: AuthAgent;
  let bank: string;
  let groceries: string;
  let salary: string;

  const month = '/api/budgets/2030/3';
  const dashboard = '/api/dashboard?year=2030&month=3';

  beforeAll(async () => {
    app = await createTestApp();
    owner = await createAuthAgent(app, await createIsolatedUser(app));
    admin = await createAuthAgent(app, ADMIN_CREDENTIALS);

    const uuidOf = (body: unknown) => dataOf<{ uuid: string }>(body).uuid;

    bank = uuidOf(
      (
        await owner
          .post('/api/accounts')
          .send({
            name: 'Bank',
            type: 'CHECKING',
            openingBalance: '1000.00',
            openingBalanceDate: '2026-01-01',
          })
          .expect(201)
      ).body,
    );

    groceries = uuidOf(
      (
        await owner
          .post('/api/transaction-categories')
          .send({ name: 'Groceries', kind: 'EXPENSE' })
          .expect(201)
      ).body,
    );

    salary = uuidOf(
      (
        await owner
          .post('/api/transaction-categories')
          .send({ name: 'Salary', kind: 'INCOME' })
          .expect(201)
      ).body,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns an empty budget for a month without one', async () => {
    const response = await owner.get('/api/budgets/2030/2').expect(200);

    expect(dataOf<BudgetShape>(response.body)).toEqual({
      year: 2030,
      month: 2,
      totalLimit: null,
      categoryLimits: [],
      updatedAt: null,
    });
  });

  it('saves and replaces the limits of one month only', async () => {
    await owner
      .put(month)
      .send({
        totalLimit: '999.99',
        categoryLimits: [{ categoryUuid: groceries, limit: '10.00' }],
      })
      .expect(200);

    const saved = await owner
      .put(month)
      .send({
        totalLimit: '100.00',
        categoryLimits: [{ categoryUuid: groceries, limit: '50.00' }],
      })
      .expect(200);

    expect(dataOf<BudgetShape>(saved.body)).toMatchObject({
      year: 2030,
      month: 3,
      totalLimit: '100.00',
      categoryLimits: [{ category: { uuid: groceries }, limit: '50.00' }],
    });

    const otherMonth = await owner.get('/api/budgets/2030/4').expect(200);

    expect(dataOf<BudgetShape>(otherMonth.body).totalLimit).toBeNull();
  });

  it('still saves a transaction above the limits and reports the overspending', async () => {
    await owner
      .post('/api/transactions')
      .send({
        type: 'EXPENSE',
        description: 'Market',
        amount: '150.00',
        date: '2030-03-10',
        state: 'PLANNED',
        accountUuid: bank,
        categoryUuid: groceries,
      })
      .expect(201);

    const response = await owner.get(dashboard).expect(200);
    const summary = dataOf<DashboardShape>(response.body);

    expect(summary.budget?.overall).toEqual({
      limit: '100.00',
      total: '150.00',
      completed: '0.00',
      pending: '150.00',
      remaining: '0.00',
      overspent: '50.00',
    });
    expect(summary.budget?.categories).toEqual([
      expect.objectContaining({
        category: expect.objectContaining({ uuid: groceries }) as unknown,
        limit: '50.00',
        overspent: '100.00',
      }),
    ]);
    expect(summary.spendingGuidance).toEqual({
      basis: 'BUDGET',
      remaining: '0.00',
      dailyAllowance: '0.00',
    });
  });

  it('spreads what is left of the overall limit over the remaining days', async () => {
    await owner
      .put(month)
      .send({ totalLimit: '310.00', categoryLimits: [] })
      .expect(200);

    const response = await owner.get(dashboard).expect(200);

    expect(dataOf<DashboardShape>(response.body).spendingGuidance).toEqual({
      basis: 'BUDGET',
      remaining: '160.00',
      dailyAllowance: '5.16',
    });
  });

  it('rejects a budget without limits or with an income category', async () => {
    await owner
      .put('/api/budgets/2030/5')
      .send({ totalLimit: null, categoryLimits: [] })
      .expect(422);
    await owner
      .put('/api/budgets/2030/5')
      .send({
        totalLimit: null,
        categoryLimits: [{ categoryUuid: salary, limit: '1.00' }],
      })
      .expect(422);
    await owner
      .put('/api/budgets/2030/13')
      .send({ totalLimit: '1.00', categoryLimits: [] })
      .expect(400);
  });

  it("never shows or changes the owner's budget for an admin", async () => {
    const adminView = await admin.get(month).expect(200);

    expect(dataOf<BudgetShape>(adminView.body).totalLimit).toBeNull();

    await admin.delete(month).expect(404);
    await admin
      .put('/api/budgets/2030/6')
      .send({
        totalLimit: null,
        categoryLimits: [{ categoryUuid: groceries, limit: '1.00' }],
      })
      .expect(404);

    const ownerView = await owner.get(month).expect(200);

    expect(dataOf<BudgetShape>(ownerView.body).totalLimit).toBe('310.00');
  });

  it('removes the budget of the month', async () => {
    await owner.delete(month).expect(200);
    await owner.delete(month).expect(404);

    const response = await owner.get(dashboard).expect(200);
    const summary = dataOf<DashboardShape>(response.body);

    expect(summary.budget).toBeNull();
    expect(summary.spendingGuidance.basis).toBe('BALANCE');
  });
});
