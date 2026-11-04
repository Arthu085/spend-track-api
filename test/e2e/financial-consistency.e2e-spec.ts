import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { GenerateDueRecurrenceOccurrencesUseCase } from '@modules/recurrences/application/use-cases/generate-due-recurrence-occurrences.use-case';
import { addDaysToDate, financeToday } from '@shared/domain/calendar';
import { type AuthAgent, createAuthAgent } from './helpers/auth-agent';
import { createTestApp } from './helpers/create-test-app';
import { createIsolatedUser } from './helpers/isolated-user';

interface Occurrence {
  uuid: string;
  occurrenceDate: string;
  state: string;
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

// Cross-module edge cases of the financial records. Dates derive from today
// where generation or invoice status depend on it, and each test owns a fresh
// user so no total depends on another.
describe('Financial consistency (e2e)', () => {
  let app: INestApplication<App>;

  const today = financeToday();

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
});
