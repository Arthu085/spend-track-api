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

interface InvestmentShape {
  uuid: string;
  currentValue: string;
  contributed: string;
  withdrawn: string;
  adjusted: string;
  progress: { remaining: string; percent: number } | null;
}

interface MovementShape {
  uuid: string;
  type: string;
  amount: string;
  state: string;
  account: { uuid: string } | null;
}

interface AmountsShape {
  total: string;
  completed: string;
  pending: string;
}

interface DashboardShape {
  balances: { actual: string; projected: string };
  income: AmountsShape;
  expenses: AmountsShape;
  investments: {
    totalValue: string;
    contributions: AmountsShape;
    withdrawals: AmountsShape;
    items: Array<{ uuid: string; currentValue: string }>;
  };
}

function dataOf<T>(body: unknown): T {
  return (body as EnvelopeBody<T>).data;
}

// A fixed future month keeps the dashboard figures independent of today.
describe('Investments (e2e)', () => {
  let app: INestApplication<App>;
  let owner: AuthAgent;
  let admin: AuthAgent;
  let bank: string;
  let reserve: string;

  const dashboard = '/api/dashboard?year=2030&month=3';

  beforeAll(async () => {
    app = await createTestApp();
    owner = await createAuthAgent(app, await createIsolatedUser(app));
    admin = await createAuthAgent(app, ADMIN_CREDENTIALS);

    bank = dataOf<{ uuid: string }>(
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
    ).uuid;

    reserve = dataOf<InvestmentShape>(
      (
        await owner
          .post('/api/investments')
          .send({
            name: 'Emergency reserve',
            type: 'RESERVE',
            targetAmount: '1000.00',
          })
          .expect(201)
      ).body,
    ).uuid;
  });

  afterAll(async () => {
    await app.close();
  });

  const investment = async (): Promise<InvestmentShape> =>
    dataOf<InvestmentShape>(
      (await owner.get(`/api/investments/${reserve}`).expect(200)).body,
    );

  const summary = async (): Promise<DashboardShape> =>
    dataOf<DashboardShape>((await owner.get(dashboard).expect(200)).body);

  it('moves a contribution from the account into the investment without counting it as spending', async () => {
    await owner
      .post(`/api/investments/${reserve}/movements`)
      .send({
        type: 'CONTRIBUTION',
        accountUuid: bank,
        amount: '300.00',
        date: '2030-03-05',
        state: 'COMPLETED',
      })
      .expect(201);

    const account = await owner.get(`/api/accounts/${bank}`).expect(200);

    expect(
      dataOf<{ currentBalance: string }>(account.body).currentBalance,
    ).toBe('700.00');
    expect(await investment()).toMatchObject({
      currentValue: '300.00',
      contributed: '300.00',
      progress: { remaining: '700.00', percent: 30 },
    });

    const figures = await summary();

    expect(figures.balances.actual).toBe('700.00');
    expect(figures.expenses.total).toBe('0.00');
    expect(figures.income.total).toBe('0.00');
    expect(figures.investments).toMatchObject({
      totalValue: '300.00',
      contributions: { total: '300.00', completed: '300.00', pending: '0.00' },
      items: [{ uuid: reserve, currentValue: '300.00' }],
    });
  });

  it('projects a planned contribution and applies it once when confirmed', async () => {
    const planned = dataOf<MovementShape>(
      (
        await owner
          .post(`/api/investments/${reserve}/movements`)
          .send({
            type: 'CONTRIBUTION',
            accountUuid: bank,
            amount: '100.00',
            date: '2030-03-20',
            state: 'PLANNED',
          })
          .expect(201)
      ).body,
    );

    let figures = await summary();

    expect(figures.balances).toMatchObject({
      actual: '700.00',
      projected: '600.00',
    });
    expect(figures.investments.contributions).toEqual({
      total: '400.00',
      completed: '300.00',
      pending: '100.00',
    });
    expect((await investment()).currentValue).toBe('300.00');

    const path = `/api/investments/${reserve}/movements/${planned.uuid}/state`;

    await owner.put(path).send({ state: 'COMPLETED' }).expect(200);
    await owner.put(path).send({ state: 'COMPLETED' }).expect(409);

    figures = await summary();

    expect(figures.balances).toMatchObject({
      actual: '600.00',
      projected: '600.00',
    });
    expect((await investment()).currentValue).toBe('400.00');
  });

  it('withdraws back to the account, never above the current value, without counting income', async () => {
    await owner
      .post(`/api/investments/${reserve}/movements`)
      .send({
        type: 'WITHDRAWAL',
        accountUuid: bank,
        amount: '400.01',
        date: '2030-03-25',
        state: 'COMPLETED',
      })
      .expect(422);

    await owner
      .post(`/api/investments/${reserve}/movements`)
      .send({
        type: 'WITHDRAWAL',
        accountUuid: bank,
        amount: '50.00',
        date: '2030-03-25',
        state: 'COMPLETED',
      })
      .expect(201);

    const figures = await summary();

    expect(figures.balances.actual).toBe('650.00');
    expect(figures.income.total).toBe('0.00');
    expect(figures.investments.withdrawals.completed).toBe('50.00');
    expect((await investment()).currentValue).toBe('350.00');
  });

  it('records a manual valuation that changes the value, not the bank balance', async () => {
    await owner
      .post(`/api/investments/${reserve}/valuations`)
      .send({ value: '350.00' })
      .expect(422);

    const valuation = dataOf<MovementShape>(
      (
        await owner
          .post(`/api/investments/${reserve}/valuations`)
          .send({ value: '362.45', date: '2030-03-31' })
          .expect(201)
      ).body,
    );

    expect(valuation).toMatchObject({
      type: 'VALUATION',
      amount: '12.45',
      state: 'COMPLETED',
      account: null,
    });
    expect(await investment()).toMatchObject({
      currentValue: '362.45',
      adjusted: '12.45',
    });
    expect((await summary()).balances.actual).toBe('650.00');

    const history = await owner
      .get(`/api/investments/${reserve}/movements`)
      .expect(200);

    expect(
      dataOf<MovementShape[]>(history.body).map(({ type }) => type),
    ).toEqual(['VALUATION', 'WITHDRAWAL', 'CONTRIBUTION', 'CONTRIBUTION']);
  });

  it('keeps an investment with history: no deletion, archived instead', async () => {
    await owner.delete(`/api/investments/${reserve}`).expect(409);
    await owner.delete(`/api/accounts/${bank}`).expect(409);

    await owner
      .put(`/api/investments/${reserve}/status`)
      .send({ status: 'INACTIVE' })
      .expect(200);
    await owner.get(`/api/investments/${reserve}`).expect(409);
    await owner
      .post(`/api/investments/${reserve}/valuations`)
      .send({ value: '1.00' })
      .expect(409);
    await owner.get(`/api/investments/${reserve}/movements`).expect(200);

    expect((await summary()).investments.items).toEqual([]);

    await owner
      .put(`/api/investments/${reserve}/status`)
      .send({ status: 'ACTIVE' })
      .expect(200);
  });

  it("never shows or changes the owner's investments for an admin", async () => {
    const list = await admin.get('/api/investments').expect(200);

    expect(
      dataOf<InvestmentShape[]>(list.body).map(({ uuid }) => uuid),
    ).not.toContain(reserve);

    await admin.get(`/api/investments/${reserve}`).expect(404);
    await admin.get(`/api/investments/${reserve}/movements`).expect(404);
    await admin
      .patch(`/api/investments/${reserve}`)
      .send({ name: 'Taken' })
      .expect(404);
    await admin
      .post(`/api/investments/${reserve}/valuations`)
      .send({ value: '0.00' })
      .expect(404);

    const own = dataOf<InvestmentShape>(
      (
        await admin
          .post('/api/investments')
          .send({ name: 'Admin reserve', type: 'RESERVE' })
          .expect(201)
      ).body,
    );

    await admin
      .post(`/api/investments/${own.uuid}/movements`)
      .send({
        type: 'CONTRIBUTION',
        accountUuid: bank,
        amount: '1.00',
        date: '2030-03-05',
        state: 'COMPLETED',
      })
      .expect(404);
    await admin.delete(`/api/investments/${own.uuid}`).expect(200);

    expect((await investment()).currentValue).toBe('362.45');
  });
});
