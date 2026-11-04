import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { GenerateDueRecurrenceOccurrencesUseCase } from '@modules/recurrences/application/use-cases/generate-due-recurrence-occurrences.use-case';
import {
  addDaysToDate,
  dayOfMonth,
  financeToday,
  monthOf,
  shiftMonth,
} from '@shared/domain/calendar';
import { type AuthAgent, createAuthAgent } from './helpers/auth-agent';
import { createTestApp } from './helpers/create-test-app';
import { createIsolatedUser } from './helpers/isolated-user';

interface Amounts {
  total: string;
  completed: string;
  pending: string;
}

interface Dashboard {
  balances: { actual: string; projected: string; available: string };
  expenses: Amounts;
  expensesByCategory: Array<Amounts & { category: { uuid: string } }>;
  creditCards: {
    planned: string;
    plannedDue: string;
    outstanding: string;
    plannedChargesCount: number;
    invoices: Array<{ uuid: string; outstanding: string }>;
  };
}

interface Occurrence {
  uuid: string;
  occurrenceDate: string;
  state: string;
}

interface Purchase {
  uuid: string;
  installments: Array<{ invoice: { uuid: string; referenceMonth: string } }>;
}

interface Invoice {
  outstanding: string;
  creditCarried: string;
}

interface Ledger {
  agent: AuthAgent;
  bank: string;
  groceries: string;
  card: string;
}

function dataOf<T>(response: { body: unknown }): T {
  return (response.body as { data: T }).data;
}

const uuidOf = (response: { body: unknown }): string =>
  dataOf<{ uuid: string }>(response).uuid;

const cents = (amount: string): number => Math.round(Number(amount) * 100);

// Cross-module edge cases of the financial records. Dates derive from today
// where generation or invoice status depend on it, and each test owns a fresh
// user so no total depends on another.
describe('Financial consistency (e2e)', () => {
  let app: INestApplication<App>;

  const today = financeToday();
  const thisMonth = monthOf(today);

  beforeAll(async () => {
    process.env.THROTTLE_LIMIT = '100000';
    process.env.AUTH_THROTTLE_LIMIT = '100000';
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function newLedger(): Promise<Ledger> {
    const agent = await createAuthAgent(app, await createIsolatedUser(app));

    return {
      agent,
      bank: uuidOf(
        await agent
          .post('/api/accounts')
          .send({
            name: 'Bank',
            type: 'CHECKING',
            openingBalance: '1000.00',
            openingBalanceDate: '2025-01-01',
          })
          .expect(201),
      ),
      groceries: uuidOf(
        await agent
          .post('/api/transaction-categories')
          .send({ name: 'Market', kind: 'EXPENSE' })
          .expect(201),
      ),
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
    ref: { year: number; month: number },
    perspective = 'PURCHASE_DATE',
  ): Promise<Dashboard> {
    return dataOf<Dashboard>(
      await agent
        .get(
          `/api/dashboard?year=${ref.year}&month=${ref.month}&perspective=${perspective}`,
        )
        .expect(200),
    );
  }

  async function recurrenceOn(
    ledger: Ledger,
    target: Record<string, string>,
  ): Promise<string> {
    return uuidOf(
      await ledger.agent
        .post('/api/recurrences')
        .send({
          type: 'EXPENSE',
          description: 'Subscription',
          amount: '50.00',
          frequency: 'MONTHLY',
          startDate: addDaysToDate(today, 1),
          categoryUuid: ledger.groceries,
          ...target,
        })
        .expect(201),
    );
  }

  async function occurrencesOf(
    { agent }: Ledger,
    recurrence: string,
  ): Promise<Occurrence[]> {
    return dataOf<Occurrence[]>(
      await agent
        .get(`/api/recurrences/${recurrence}/occurrences?limit=50`)
        .expect(200),
    );
  }

  async function buy(ledger: Ledger, amount: string, date: string) {
    return dataOf<Purchase>(
      await ledger.agent
        .post('/api/credit-card-purchases')
        .send({
          cardUuid: ledger.card,
          categoryUuid: ledger.groceries,
          description: 'Card purchase',
          amount,
          purchaseDate: date,
          installmentCount: 1,
        })
        .expect(201),
    );
  }

  describe('daily generation', () => {
    it('extends account and card recurrences from where they stopped, skipping dates before the opening date', async () => {
      const ledger = await newLedger();
      const dataSource = app.get<DataSource>(getDataSourceToken());

      const onAccount = await recurrenceOn(ledger, {
        accountUuid: ledger.bank,
      });

      const onCard = await recurrenceOn(ledger, {
        creditCardUuid: ledger.card,
      });

      const accountDates = (await occurrencesOf(ledger, onAccount)).map(
        ({ occurrenceDate }) => occurrenceDate,
      );

      const cardDates = (await occurrencesOf(ledger, onCard)).map(
        ({ occurrenceDate }) => occurrenceDate,
      );

      const cursor = accountDates[1];
      const opening = accountDates[4];

      await dataSource.query(
        `UPDATE transactions SET deleted_at = now()
         WHERE recurrence_id = (SELECT id FROM recurrences WHERE uuid = $1)
           AND recurrence_date > $2`,
        [onAccount, cursor],
      );

      await dataSource.query(
        `UPDATE recurrence_card_charges SET deleted_at = now()
         WHERE recurrence_id = (SELECT id FROM recurrences WHERE uuid = $1)
           AND occurrence_date > $2`,
        [onCard, cursor],
      );

      await dataSource.query(
        'UPDATE recurrences SET generated_through = $1 WHERE uuid = ANY($2)',
        [cursor, [onAccount, onCard]],
      );

      await dataSource.query(
        'UPDATE accounts SET opening_balance_date = $1 WHERE uuid = $2',
        [opening, ledger.bank],
      );

      await expect(
        app.get(GenerateDueRecurrenceOccurrencesUseCase).execute(),
      ).resolves.toBeGreaterThanOrEqual(2);

      expect(
        (await occurrencesOf(ledger, onAccount)).map(
          ({ occurrenceDate }) => occurrenceDate,
        ),
      ).toEqual([...accountDates.slice(0, 2), ...accountDates.slice(4)]);

      expect(
        (await occurrencesOf(ledger, onCard)).map(
          ({ occurrenceDate }) => occurrenceDate,
        ),
      ).toEqual(cardDates);
    });
  });

  describe('pausing and resuming a recurrence', () => {
    it.each([
      ['an account', (ledger: Ledger) => ({ accountUuid: ledger.bank })],
      ['a card', (ledger: Ledger) => ({ creditCardUuid: ledger.card })],
    ])(
      'keeps canceled and confirmed future occurrences of %s recurrence',
      async (_target, targetOf) => {
        const ledger = await newLedger();
        const recurrence = await recurrenceOn(ledger, targetOf(ledger));
        const occurrences = await occurrencesOf(ledger, recurrence);
        const path = `/api/recurrences/${recurrence}/occurrences`;

        await ledger.agent
          .put(`${path}/${occurrences[2].uuid}/cancellation`)
          .send({})
          .expect(200);

        await ledger.agent
          .put(`${path}/${occurrences[3].uuid}/confirmation`)
          .send({ date: occurrences[3].occurrenceDate })
          .expect(200);

        await ledger.agent
          .put(`/api/recurrences/${recurrence}/state`)
          .send({ state: 'PAUSED' })
          .expect(200);

        await ledger.agent
          .put(`/api/recurrences/${recurrence}/state`)
          .send({ state: 'ACTIVE' })
          .expect(200);

        const resumed = await occurrencesOf(ledger, recurrence);

        expect(resumed.map(({ occurrenceDate }) => occurrenceDate)).toEqual(
          occurrences.map(({ occurrenceDate }) => occurrenceDate),
        );
        expect(resumed[2].state).toBe('CANCELED');
        expect(resumed[3].state).toBe('COMPLETED');
        expect(resumed[0].state).toBe('PLANNED');
      },
    );
  });

  describe('deleting a card', () => {
    it('stops counting the planned charges of a deleted card', async () => {
      const ledger = await newLedger();

      await recurrenceOn(ledger, { creditCardUuid: ledger.card });

      const ref = shiftMonth(thisMonth, 3);
      const before = await dashboardOf(ledger, ref);

      expect(cents(before.creditCards.plannedDue)).toBeGreaterThan(0);
      expect(cents(before.creditCards.planned)).toBeGreaterThan(0);

      await ledger.agent.delete(`/api/credit-cards/${ledger.card}`).expect(200);

      const after = await dashboardOf(ledger, ref);

      expect(after.creditCards).toMatchObject({
        plannedDue: '0.00',
        planned: '0.00',
        plannedChargesCount: 0,
      });
      expect(after.expenses.pending).toBe('0.00');
      expect(after.expensesByCategory).toEqual([]);
      expect(after.balances.available).toBe(after.balances.projected);
    });

    it('keeps a card holding an invoice payment, so its credit is not stranded', async () => {
      const ledger = await newLedger();
      const purchase = await buy(ledger, '100.00', '2030-10-29');
      const invoice = purchase.installments[0].invoice.uuid;

      await ledger.agent
        .post(`/api/credit-card-invoices/${invoice}/payments`)
        .send({ accountUuid: ledger.bank, amount: '100.00' })
        .expect(201);

      await ledger.agent
        .delete(`/api/credit-card-purchases/${purchase.uuid}`)
        .expect(200);

      await ledger.agent.delete(`/api/credit-cards/${ledger.card}`).expect(409);

      const card = dataOf<{ creditBalance: string }>(
        await ledger.agent.get(`/api/credit-cards/${ledger.card}`).expect(200),
      );

      expect(card.creditBalance).toBe('100.00');
    });

    it('drops the empty invoices of a deleted card from the dashboard', async () => {
      const ledger = await newLedger();
      const purchase = await buy(ledger, '100.00', '2030-10-29');

      const ref = { year: 2030, month: 11 };

      expect(
        (await dashboardOf(ledger, ref)).creditCards.invoices,
      ).toHaveLength(1);

      await ledger.agent
        .delete(`/api/credit-card-purchases/${purchase.uuid}`)
        .expect(200);

      await ledger.agent.delete(`/api/credit-cards/${ledger.card}`).expect(200);

      expect((await dashboardOf(ledger, ref)).creditCards.invoices).toEqual([]);
    });
  });

  describe('refunds and credit carried between invoices', () => {
    it('keeps category totals reconciled in both perspectives when a refund exceeds the month spending', async () => {
      const ledger = await newLedger();
      const purchase = await buy(ledger, '300.00', '2030-10-29');

      await ledger.agent
        .post(`/api/credit-card-purchases/${purchase.uuid}/refunds`)
        .send({ amount: '120.00', date: '2030-12-10' })
        .expect(201);

      for (const [perspective, ref] of [
        ['PURCHASE_DATE', { year: 2030, month: 12 }],
        ['INVOICE_MONTH', { year: 2031, month: 1 }],
      ] as const) {
        const summary = await dashboardOf(ledger, ref, perspective);

        expect(summary.expenses.completed).toBe('-120.00');
        expect(
          summary.expensesByCategory.reduce(
            (total, entry) => total + cents(entry.total),
            0,
          ),
        ).toBe(cents(summary.expenses.total));
      }
    });

    it('moves the carried credit back to the invoice when a payment is canceled', async () => {
      const ledger = await newLedger();
      const first = await buy(ledger, '100.00', '2030-10-29');
      const second = await buy(ledger, '40.00', '2030-11-20');
      const firstInvoice = first.installments[0].invoice.uuid;
      const secondInvoice = second.installments[0].invoice.uuid;

      const payment = uuidOf(
        await ledger.agent
          .post(`/api/credit-card-invoices/${firstInvoice}/payments`)
          .send({ accountUuid: ledger.bank, amount: '100.00' })
          .expect(201),
      );

      await ledger.agent
        .post(`/api/credit-card-purchases/${first.uuid}/refunds`)
        .send({ amount: '30.00', date: '2030-10-30' })
        .expect(201);

      const invoiceOf = async (uuid: string) =>
        dataOf<Invoice>(
          await ledger.agent
            .get(`/api/credit-card-invoices/${uuid}`)
            .expect(200),
        );

      expect(await invoiceOf(firstInvoice)).toMatchObject({
        outstanding: '0.00',
        creditCarried: '30.00',
      });
      expect(await invoiceOf(secondInvoice)).toMatchObject({
        outstanding: '10.00',
      });

      await ledger.agent
        .put(
          `/api/credit-card-invoices/${firstInvoice}/payments/${payment}/cancellation`,
        )
        .send({})
        .expect(200);

      expect(await invoiceOf(firstInvoice)).toMatchObject({
        outstanding: '70.00',
        creditCarried: '0.00',
      });
      expect(await invoiceOf(secondInvoice)).toMatchObject({
        outstanding: '40.00',
      });
    });

    it('leaves the account balance and the outstanding amounts in agreement after an archived card is paid', async () => {
      const ledger = await newLedger();
      const purchase = await buy(ledger, '80.00', dayOfMonth(thisMonth, 2));
      const invoice = purchase.installments[0].invoice.uuid;
      const ref = monthOf(purchase.installments[0].invoice.referenceMonth);

      await ledger.agent
        .put(`/api/credit-cards/${ledger.card}/status`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      const owing = await dashboardOf(ledger, ref);

      expect(owing.creditCards.outstanding).toBe('80.00');
      expect(owing.balances.available).toBe('920.00');

      await ledger.agent
        .post(`/api/credit-card-invoices/${invoice}/payments`)
        .send({ accountUuid: ledger.bank, amount: '80.00', paidOn: today })
        .expect(201);

      const paid = await dashboardOf(ledger, ref);

      expect(paid.creditCards.outstanding).toBe('0.00');
      expect(paid.balances).toMatchObject({
        actual: '920.00',
        available: '920.00',
      });
    });
  });
});
