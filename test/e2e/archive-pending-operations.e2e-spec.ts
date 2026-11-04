import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { financeToday } from '@shared/domain/calendar';
import { type AuthAgent, createAuthAgent } from './helpers/auth-agent';
import { createTestApp } from './helpers/create-test-app';
import { createIsolatedUser } from './helpers/isolated-user';

interface EnvelopeBody<T> {
  data: T;
  meta?: { total: number };
}

interface OccurrenceShape {
  uuid: string;
  amount: string;
  state: string;
  purchaseUuid: string | null;
  invoiceMonth: string;
  canceledAt?: string | null;
}

interface MovementShape {
  uuid: string;
  type: string;
  amount: string;
  state: string;
  canceledAt: string | null;
}

interface AmountsShape {
  total: string;
  completed: string;
  pending: string;
}

interface AccountBalanceShape {
  uuid: string;
  actualBalance: string;
  projectedBalance: string;
}

interface DashboardShape {
  balances: { actual: string; projected: string; available: string };
  accounts: AccountBalanceShape[];
  expenses: AmountsShape;
  budget: {
    overall: { total: string; completed: string; pending: string };
    categories: Array<{ total: string; completed: string; pending: string }>;
  } | null;
  creditCards: {
    spending: string;
    planned: string;
    plannedDue: string;
    plannedChargesCount: number;
    outstanding: string;
    invoices: Array<{ outstanding: string }>;
  };
  investments: {
    totalValue: string;
    contributions: AmountsShape;
    withdrawals: AmountsShape;
  };
}

function dataOf<T>(body: unknown): T {
  return (body as EnvelopeBody<T>).data;
}

// Login is throttled, so scenarios share one isolated user, except the two that
// read user-wide card figures. Card recurrences generate from today, so those
// read the invoice month of the first charge. Investment scenarios read their
// own account and their own fixed future month instead.
describe('Archiving with pending operations (e2e)', () => {
  let app: INestApplication<App>;
  let shared: AuthAgent;

  beforeAll(async () => {
    app = await createTestApp();
    shared = await newAgent();
  });

  afterAll(async () => {
    await app.close();
  });

  async function newAgent(): Promise<AuthAgent> {
    return createAuthAgent(app, await createIsolatedUser(app));
  }

  async function newBank(agent: AuthAgent): Promise<string> {
    const bank = await agent
      .post('/api/accounts')
      .send({
        name: 'Bank',
        type: 'CHECKING',
        openingBalance: '1000.00',
        openingBalanceDate: '2025-01-01',
      })
      .expect(201);

    return dataOf<{ uuid: string }>(bank.body).uuid;
  }

  async function bankBalance(agent: AuthAgent, bank: string): Promise<string> {
    const response = await agent.get(`/api/accounts/${bank}`).expect(200);

    return dataOf<{ currentBalance: string }>(response.body).currentBalance;
  }

  describe('credit cards', () => {
    const today = financeToday();

    interface CardWallet {
      agent: AuthAgent;
      bank: string;
      card: string;
      category: string;
      recurrence: string;
      charges: OccurrenceShape[];
      budgetMonth: string;
      dashboardQuery: string;
    }

    async function newCardWallet(
      agent: AuthAgent = shared,
    ): Promise<CardWallet> {
      const bank = await newBank(agent);

      const category = await agent
        .post('/api/transaction-categories')
        .send({ name: `Streaming ${randomUUID()}`, kind: 'EXPENSE' })
        .expect(201);

      const categoryUuid = dataOf<{ uuid: string }>(category.body).uuid;

      const card = await agent
        .post('/api/credit-cards')
        .send({
          name: 'Visa',
          creditLimit: '5000.00',
          closingDay: 5,
          dueDay: 12,
        })
        .expect(201);

      const cardUuid = dataOf<{ uuid: string }>(card.body).uuid;

      const recurrence = await agent
        .post('/api/recurrences')
        .send({
          type: 'EXPENSE',
          description: 'Netflix',
          amount: '55.90',
          frequency: 'MONTHLY',
          startDate: today,
          creditCardUuid: cardUuid,
          categoryUuid,
        })
        .expect(201);

      const recurrenceUuid = dataOf<{ uuid: string }>(recurrence.body).uuid;

      const charges = await chargesOf(agent, recurrenceUuid);
      const [year, month] = charges[0].invoiceMonth.split('-').map(Number);
      const budgetMonth = `/api/budgets/${year}/${month}`;

      await agent
        .put(budgetMonth)
        .send({
          totalLimit: '1000.00',
          categoryLimits: [{ categoryUuid, limit: '500.00' }],
        })
        .expect(200);

      return {
        agent,
        bank,
        card: cardUuid,
        category: categoryUuid,
        recurrence: recurrenceUuid,
        charges,
        budgetMonth,
        dashboardQuery: `year=${year}&month=${month}&perspective=INVOICE_MONTH`,
      };
    }

    async function chargesOf(
      agent: AuthAgent,
      recurrence: string,
    ): Promise<OccurrenceShape[]> {
      const response = await agent
        .get(`/api/recurrences/${recurrence}/occurrences?limit=50`)
        .expect(200);

      return dataOf<OccurrenceShape[]>(response.body);
    }

    async function dashboardOf(wallet: CardWallet): Promise<DashboardShape> {
      const response = await wallet.agent
        .get(`/api/dashboard?${wallet.dashboardQuery}`)
        .expect(200);

      return dataOf<DashboardShape>(response.body);
    }

    it('reports the planned charges and refuses to archive without a decision', async () => {
      const wallet = await newCardWallet();

      const pending = await wallet.agent
        .get(`/api/credit-cards/${wallet.card}/pending-operations`)
        .expect(200);

      const { count, total } = dataOf<{ count: number; total: string }>(
        pending.body,
      );

      expect(count).toBe(wallet.charges.length);
      expect(total).toBe((count * 55.9).toFixed(2));

      const refused = await wallet.agent
        .put(`/api/credit-cards/${wallet.card}/status`)
        .set('Accept-Language', 'en')
        .send({ status: 'INACTIVE' })
        .expect(409);

      expect((refused.body as { message: string }).message).toBe(
        'This credit card has planned recurring charges; choose whether to keep or cancel them before archiving it',
      );

      await wallet.agent
        .put(`/api/credit-cards/${wallet.card}/status`)
        .send({ status: 'INACTIVE', pendingOperations: 'DROP' })
        .expect(400);
      await wallet.agent
        .put(`/api/credit-cards/${wallet.card}/status`)
        .send({ status: 'INACTIVE', pendingOperations: null })
        .expect(400);

      await wallet.agent.get(`/api/credit-cards/${wallet.card}`).expect(200);
    });

    it('archives without a decision when nothing is planned', async () => {
      const card = await shared
        .post('/api/credit-cards')
        .send({
          name: 'Empty',
          creditLimit: '100.00',
          closingDay: 5,
          dueDay: 12,
        })
        .expect(201);

      const uuid = dataOf<{ uuid: string }>(card.body).uuid;

      const pending = await shared
        .get(`/api/credit-cards/${uuid}/pending-operations`)
        .expect(200);

      expect(dataOf(pending.body)).toEqual({ count: 0, total: '0.00' });

      await shared
        .put(`/api/credit-cards/${uuid}/status`)
        .send({ status: 'INACTIVE' })
        .expect(200);
    });

    it('keeps the charges counted and confirmable, while the card rejects new purchases', async () => {
      const wallet = await newCardWallet(await newAgent());
      const { agent, card, recurrence, category, charges } = wallet;
      const before = await dashboardOf(wallet);

      expect(before.creditCards).toMatchObject({
        planned: '55.90',
        plannedDue: '55.90',
        spending: '0.00',
      });
      expect(before.expenses.pending).toBe('55.90');
      expect(before.balances.available).toBe('944.10');
      expect(before.budget?.overall.pending).toBe('55.90');
      expect(before.budget?.categories[0].pending).toBe('55.90');

      await agent
        .put(`/api/credit-cards/${card}/status`)
        .send({ status: 'INACTIVE', pendingOperations: 'KEEP' })
        .expect(200);

      const archived = await dashboardOf(wallet);

      expect(archived.balances).toEqual(before.balances);
      expect(archived.expenses).toEqual(before.expenses);
      expect(archived.budget).toEqual(before.budget);
      expect(archived.creditCards).toMatchObject({
        planned: '55.90',
        plannedDue: '55.90',
        plannedChargesCount: before.creditCards.plannedChargesCount,
      });
      expect(
        (await chargesOf(agent, recurrence)).every(
          ({ state }) => state === 'PLANNED',
        ),
      ).toBe(true);

      await agent
        .post('/api/credit-card-purchases')
        .send({
          cardUuid: card,
          categoryUuid: category,
          description: 'New',
          amount: '10.00',
          purchaseDate: today,
        })
        .expect(409);

      const confirmed = await agent
        .put(
          `/api/recurrences/${recurrence}/occurrences/${charges[0].uuid}/confirmation`,
        )
        .send({})
        .expect(200);

      const occurrence = dataOf<OccurrenceShape>(confirmed.body);

      expect(occurrence.state).toBe('COMPLETED');
      expect(occurrence.purchaseUuid).not.toBeNull();

      const invoices = await agent
        .get(`/api/credit-cards/${card}/invoices`)
        .expect(200);

      expect(dataOf<Array<{ charges: string }>>(invoices.body)).toEqual([
        expect.objectContaining({ charges: '55.90', outstanding: '55.90' }),
      ]);

      const after = await dashboardOf(wallet);

      expect(after.creditCards).toMatchObject({
        planned: '0.00',
        plannedDue: '0.00',
        spending: '55.90',
        outstanding: '55.90',
      });
      expect(after.expenses).toMatchObject({
        completed: '55.90',
        pending: '0.00',
      });
      expect(after.balances.available).toBe('944.10');
      expect(after.budget?.overall).toMatchObject({
        completed: '55.90',
        pending: '0.00',
      });

      const remaining = await agent
        .get(`/api/credit-cards/${card}/pending-operations`)
        .expect(200);

      expect(dataOf<{ count: number }>(remaining.body).count).toBe(
        charges.length - 1,
      );
    });

    it('cancels the charges as history and never touches purchases, invoices, or payments', async () => {
      const wallet = await newCardWallet(await newAgent());
      const { agent, bank, card, recurrence, category, charges } = wallet;

      const purchase = await agent
        .post('/api/credit-card-purchases')
        .send({
          cardUuid: card,
          categoryUuid: category,
          description: 'Shoes',
          amount: '100.00',
          purchaseDate: today,
        })
        .expect(201);

      const { uuid: purchaseUuid, installments } = dataOf<{
        uuid: string;
        installments: Array<{ invoice: { uuid: string } }>;
      }>(purchase.body);

      await agent
        .post(
          `/api/credit-card-invoices/${installments[0].invoice.uuid}/payments`,
        )
        .send({ accountUuid: bank, amount: '40.00', paidOn: today })
        .expect(201);

      await agent
        .put(`/api/credit-cards/${card}/status`)
        .send({ status: 'INACTIVE', pendingOperations: 'CANCEL' })
        .expect(200);

      const canceled = await chargesOf(agent, recurrence);

      expect(canceled.map(({ uuid }) => uuid)).toEqual(
        charges.map(({ uuid }) => uuid),
      );
      expect(canceled.every(({ state }) => state === 'CANCELED')).toBe(true);

      const after = await dashboardOf(wallet);

      expect(after.creditCards).toMatchObject({
        planned: '0.00',
        plannedDue: '0.00',
        plannedChargesCount: 0,
        spending: '100.00',
        outstanding: '60.00',
      });
      expect(after.expenses).toMatchObject({
        completed: '100.00',
        pending: '0.00',
      });
      expect(after.balances).toMatchObject({
        actual: '960.00',
        available: '900.00',
      });
      expect(after.budget?.overall).toMatchObject({
        completed: '100.00',
        pending: '0.00',
      });
      expect(after.budget?.categories[0].pending).toBe('0.00');

      await expect(bankBalance(agent, bank)).resolves.toBe('960.00');
      await agent.get(`/api/credit-card-purchases/${purchaseUuid}`).expect(200);

      const invoice = await agent
        .get(`/api/credit-card-invoices/${installments[0].invoice.uuid}`)
        .expect(200);

      expect(
        dataOf<{
          paid: string;
          outstanding: string;
          payments: Array<{ amount: string; canceledAt: string | null }>;
        }>(invoice.body),
      ).toMatchObject({
        paid: '40.00',
        outstanding: '60.00',
        payments: [{ amount: '40.00', canceledAt: null }],
      });

      const pending = await agent
        .get(`/api/credit-cards/${card}/pending-operations`)
        .expect(200);

      expect(dataOf(pending.body)).toEqual({ count: 0, total: '0.00' });

      await agent
        .put(
          `/api/recurrences/${recurrence}/occurrences/${charges[0].uuid}/confirmation`,
        )
        .send({})
        .expect(409);
    });

    it('does not bring canceled charges back when the card is reactivated', async () => {
      const wallet = await newCardWallet();
      const { agent, card, recurrence, charges } = wallet;

      await agent
        .put(`/api/credit-cards/${card}/status`)
        .send({ status: 'INACTIVE', pendingOperations: 'CANCEL' })
        .expect(200);
      await agent
        .put(`/api/credit-cards/${card}/status`)
        .send({ status: 'ACTIVE' })
        .expect(200);

      const after = await chargesOf(agent, recurrence);

      expect(after).toHaveLength(charges.length);
      expect(after.every(({ state }) => state === 'CANCELED')).toBe(true);
    });
  });

  describe('investments', () => {
    interface InvestmentWallet {
      bank: string;
      investment: string;
      contribution: MovementShape;
      withdrawal: MovementShape;
      movementDate: string;
      dashboardQuery: string;
    }

    async function newInvestmentWallet(
      year: number,
    ): Promise<InvestmentWallet> {
      const bank = await newBank(shared);
      const movementDate = `${year}-05-10`;

      const investment = await shared
        .post('/api/investments')
        .send({ name: `Reserve ${year}`, type: 'RESERVE' })
        .expect(201);

      const uuid = dataOf<{ uuid: string }>(investment.body).uuid;

      const move = async (body: object): Promise<MovementShape> => {
        const response = await shared
          .post(`/api/investments/${uuid}/movements`)
          .send({ accountUuid: bank, date: movementDate, ...body })
          .expect(201);

        return dataOf<MovementShape>(response.body);
      };

      await move({
        type: 'CONTRIBUTION',
        amount: '300.00',
        state: 'COMPLETED',
        date: '2025-06-01',
      });

      return {
        bank,
        investment: uuid,
        contribution: await move({
          type: 'CONTRIBUTION',
          amount: '100.00',
          state: 'PLANNED',
        }),
        withdrawal: await move({
          type: 'WITHDRAWAL',
          amount: '50.00',
          state: 'PLANNED',
        }),
        movementDate,
        dashboardQuery: `year=${year}&month=5`,
      };
    }

    async function dashboardOf(
      wallet: InvestmentWallet,
    ): Promise<DashboardShape & { account: AccountBalanceShape }> {
      const response = await shared
        .get(`/api/dashboard?${wallet.dashboardQuery}`)
        .expect(200);

      const dashboard = dataOf<DashboardShape>(response.body);

      const account = dashboard.accounts.find(
        ({ uuid }) => uuid === wallet.bank,
      );

      if (!account) {
        throw new Error('The dashboard must list the account of the wallet');
      }

      return { ...dashboard, account };
    }

    async function archivedValue(
      investment: string,
    ): Promise<string | undefined> {
      const response = await shared
        .get('/api/investments?status=INACTIVE&limit=50')
        .expect(200);

      return dataOf<Array<{ uuid: string; currentValue: string }>>(
        response.body,
      ).find(({ uuid }) => uuid === investment)?.currentValue;
    }

    async function movementsOf(investment: string): Promise<MovementShape[]> {
      const response = await shared
        .get(`/api/investments/${investment}/movements`)
        .expect(200);

      return dataOf<MovementShape[]>(response.body);
    }

    it('reports the planned movements and refuses to archive without a decision', async () => {
      const { investment } = await newInvestmentWallet(2031);

      const pending = await shared
        .get(`/api/investments/${investment}/pending-operations`)
        .expect(200);

      expect(dataOf(pending.body)).toEqual({ count: 2, total: '150.00' });

      await shared
        .put(`/api/investments/${investment}/status`)
        .send({ status: 'INACTIVE' })
        .expect(409);
      await shared
        .put(`/api/investments/${investment}/status`)
        .send({ status: 'INACTIVE', pendingOperations: 'DROP' })
        .expect(400);
      await shared.get(`/api/investments/${investment}`).expect(200);
    });

    it('keeps the movements projected and confirmable, while the investment rejects new ones', async () => {
      const wallet = await newInvestmentWallet(2032);
      const { bank, investment, contribution, movementDate } = wallet;

      const before = await dashboardOf(wallet);

      expect(before.account).toMatchObject({
        actualBalance: '700.00',
        projectedBalance: '650.00',
      });
      expect(before.investments.contributions.pending).toBe('100.00');
      expect(before.investments.withdrawals.pending).toBe('50.00');

      await shared
        .put(`/api/investments/${investment}/status`)
        .send({ status: 'INACTIVE', pendingOperations: 'KEEP' })
        .expect(200);

      const archived = await dashboardOf(wallet);

      expect(archived.account).toEqual(before.account);
      expect(archived.balances).toEqual(before.balances);
      expect(archived.investments.contributions).toEqual(
        before.investments.contributions,
      );
      expect(archived.investments.withdrawals).toEqual(
        before.investments.withdrawals,
      );

      await shared
        .post(`/api/investments/${investment}/movements`)
        .send({
          accountUuid: bank,
          type: 'CONTRIBUTION',
          amount: '1.00',
          date: movementDate,
          state: 'COMPLETED',
        })
        .expect(409);
      await shared
        .post(`/api/investments/${investment}/valuations`)
        .send({ value: '1.00' })
        .expect(409);

      await shared
        .put(
          `/api/investments/${investment}/movements/${contribution.uuid}/state`,
        )
        .send({ state: 'COMPLETED', completedOn: movementDate })
        .expect(200);

      await expect(bankBalance(shared, bank)).resolves.toBe('600.00');
      await expect(archivedValue(investment)).resolves.toBe('400.00');

      const after = await dashboardOf(wallet);

      expect(after.account).toMatchObject({
        actualBalance: '600.00',
        projectedBalance: '650.00',
      });
      expect(after.investments.contributions).toMatchObject({
        completed: '100.00',
        pending: '0.00',
      });
    });

    it('still refuses to confirm a kept movement on an inactive account', async () => {
      const { bank, investment, withdrawal } = await newInvestmentWallet(2033);

      await shared
        .put(`/api/investments/${investment}/status`)
        .send({ status: 'INACTIVE', pendingOperations: 'KEEP' })
        .expect(200);
      await shared
        .put(`/api/accounts/${bank}/status`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      await shared
        .put(
          `/api/investments/${investment}/movements/${withdrawal.uuid}/state`,
        )
        .send({ state: 'COMPLETED' })
        .expect(409);
    });

    it('cancels the planned movements as history and keeps the completed ones', async () => {
      const wallet = await newInvestmentWallet(2034);
      const { bank, investment, contribution, withdrawal } = wallet;

      await shared
        .put(`/api/investments/${investment}/status`)
        .send({ status: 'INACTIVE', pendingOperations: 'CANCEL' })
        .expect(200);

      const movements = await movementsOf(investment);

      expect(movements).toHaveLength(3);
      expect(
        movements
          .filter(({ uuid }) =>
            [contribution.uuid, withdrawal.uuid].includes(uuid),
          )
          .map(({ state, canceledAt }) => [state, canceledAt !== null]),
      ).toEqual([
        ['CANCELED', true],
        ['CANCELED', true],
      ]);
      expect(
        movements.find(({ state }) => state === 'COMPLETED'),
      ).toMatchObject({ amount: '300.00', canceledAt: null });

      await expect(bankBalance(shared, bank)).resolves.toBe('700.00');
      await expect(archivedValue(investment)).resolves.toBe('300.00');

      const after = await dashboardOf(wallet);

      expect(after.account).toMatchObject({
        actualBalance: '700.00',
        projectedBalance: '700.00',
      });
      expect(after.investments.contributions.pending).toBe('0.00');
      expect(after.investments.withdrawals.pending).toBe('0.00');

      const pending = await shared
        .get(`/api/investments/${investment}/pending-operations`)
        .expect(200);

      expect(dataOf(pending.body)).toEqual({ count: 0, total: '0.00' });

      await shared
        .put(
          `/api/investments/${investment}/movements/${contribution.uuid}/state`,
        )
        .send({ state: 'COMPLETED' })
        .expect(409);
    });
  });
});
