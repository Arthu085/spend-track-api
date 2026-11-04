import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  addDaysToDate,
  addMonthsToDate,
  financeToday,
} from '@shared/domain/calendar';
import { type AuthAgent, createAuthAgent } from './helpers/auth-agent';
import { createTestApp } from './helpers/create-test-app';
import { createIsolatedUser } from './helpers/isolated-user';

interface Account {
  uuid: string;
  openingBalance: string;
  openingBalanceDate: string;
  currentBalance: string;
}

interface Dashboard {
  accounts: Array<{
    uuid: string;
    actualBalance: string;
    projectedBalance: string;
  }>;
}

interface Occurrence {
  uuid: string;
  occurrenceDate: string;
  date: string;
  state: string;
}

interface Wallet {
  agent: AuthAgent;
  bank: string;
  savings: string;
  expense: string;
  card: string;
  investment: string;
}

const OPENING_DATE = '2030-06-15';
const BEFORE_OPENING = '2030-06-14';
const AFTER_OPENING = '2030-07-01';
const TODAY = financeToday();
const BEFORE_OPENING_ERROR = 422;

function dataOf<T>(response: { body: unknown }): T {
  return (response.body as { data: T }).data;
}

const uuidOf = (response: { body: unknown }): string =>
  dataOf<{ uuid: string }>(response).uuid;

// Every wallet account opens in the future relative to the fixed dates below,
// so an operation "today" also falls before the opening date when no date is sent.
describe('Account opening balance rules (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.THROTTLE_LIMIT = '100000';
    process.env.AUTH_THROTTLE_LIMIT = '100000';
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function newWallet(openingDate = OPENING_DATE): Promise<Wallet> {
    const agent = await createAuthAgent(app, await createIsolatedUser(app));

    const account = async (name: string) =>
      uuidOf(
        await agent
          .post('/api/accounts')
          .send({
            name,
            type: 'CHECKING',
            openingBalance: '1000.00',
            openingBalanceDate: openingDate,
          })
          .expect(201),
      );

    return {
      agent,
      bank: await account('Bank'),
      savings: await account('Savings'),
      expense: uuidOf(
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
      investment: uuidOf(
        await agent
          .post('/api/investments')
          .send({ name: 'Reserve', type: 'RESERVE' })
          .expect(201),
      ),
    };
  }

  function expenseBody(wallet: Wallet, body: Record<string, unknown> = {}) {
    return {
      type: 'EXPENSE',
      description: 'Market',
      amount: '100.00',
      date: AFTER_OPENING,
      state: 'PLANNED',
      accountUuid: wallet.bank,
      categoryUuid: wallet.expense,
      ...body,
    };
  }

  function transferBody(wallet: Wallet, body: Record<string, unknown> = {}) {
    return {
      type: 'TRANSFER',
      description: 'Move',
      amount: '100.00',
      date: AFTER_OPENING,
      state: 'PLANNED',
      accountUuid: wallet.bank,
      destinationAccountUuid: wallet.savings,
      ...body,
    };
  }

  async function plannedExpense(
    wallet: Wallet,
    body: Record<string, unknown> = {},
  ): Promise<string> {
    return uuidOf(
      await wallet.agent
        .post('/api/transactions')
        .send(expenseBody(wallet, body))
        .expect(201),
    );
  }

  function patchOpening(wallet: Wallet, body: Record<string, unknown>) {
    return wallet.agent.patch(`/api/accounts/${wallet.bank}`).send(body);
  }

  async function accountOf(wallet: Wallet): Promise<Account> {
    return dataOf<Account>(
      await wallet.agent.get(`/api/accounts/${wallet.bank}`).expect(200),
    );
  }

  describe('operations dated before the opening date', () => {
    it('rejects a transaction before the opening date of its account', async () => {
      const wallet = await newWallet();

      await wallet.agent
        .post('/api/transactions')
        .send(expenseBody(wallet, { date: BEFORE_OPENING }))
        .expect(BEFORE_OPENING_ERROR);

      await wallet.agent
        .post('/api/transactions')
        .send(expenseBody(wallet, { date: OPENING_DATE }))
        .expect(201);
    });

    it('rejects a completed transaction whose completion precedes the opening date', async () => {
      const wallet = await newWallet();

      await wallet.agent
        .post('/api/transactions')
        .send(
          expenseBody(wallet, {
            state: 'COMPLETED',
            completedOn: BEFORE_OPENING,
          }),
        )
        .expect(BEFORE_OPENING_ERROR);
    });

    it('checks both accounts of a transfer', async () => {
      const wallet = await newWallet();

      await wallet.agent
        .patch(`/api/accounts/${wallet.savings}`)
        .send({ openingBalanceDate: '2030-06-20' })
        .expect(200);

      await wallet.agent
        .post('/api/transactions')
        .send(transferBody(wallet, { date: '2030-06-19' }))
        .expect(BEFORE_OPENING_ERROR);

      await wallet.agent
        .post('/api/transactions')
        .send(transferBody(wallet, { date: '2030-06-20' }))
        .expect(201);
    });

    it('rejects an update moving the date or the account before the opening date', async () => {
      const wallet = await newWallet();
      const transaction = await plannedExpense(wallet);
      const path = `/api/transactions/${transaction}`;

      await wallet.agent
        .patch(path)
        .send({ date: BEFORE_OPENING })
        .expect(BEFORE_OPENING_ERROR);

      const late = uuidOf(
        await wallet.agent
          .post('/api/accounts')
          .send({
            name: 'Late',
            type: 'CHECKING',
            openingBalance: '0.00',
            openingBalanceDate: '2030-08-01',
          })
          .expect(201),
      );

      await wallet.agent
        .patch(path)
        .send({ accountUuid: late })
        .expect(BEFORE_OPENING_ERROR);

      await wallet.agent.patch(path).send({ date: OPENING_DATE }).expect(200);
    });

    it('rejects completing a transaction before the opening date', async () => {
      const wallet = await newWallet();
      const transaction = await plannedExpense(wallet);
      const path = `/api/transactions/${transaction}/state`;

      await wallet.agent
        .put(path)
        .send({ state: 'COMPLETED', completedOn: BEFORE_OPENING })
        .expect(BEFORE_OPENING_ERROR);

      // Without completedOn it defaults to today, before the 2030 opening date.
      await wallet.agent
        .put(path)
        .send({ state: 'COMPLETED' })
        .expect(BEFORE_OPENING_ERROR);

      await wallet.agent
        .put(path)
        .send({ state: 'COMPLETED', completedOn: AFTER_OPENING })
        .expect(200);
    });

    it('rejects an invoice payment before the opening date', async () => {
      const wallet = await newWallet();

      const purchase = dataOf<{
        installments: Array<{ invoice: { uuid: string } }>;
      }>(
        await wallet.agent
          .post('/api/credit-card-purchases')
          .send({
            cardUuid: wallet.card,
            categoryUuid: wallet.expense,
            description: 'Purchase',
            amount: '100.00',
            purchaseDate: AFTER_OPENING,
            installmentCount: 1,
          })
          .expect(201),
      );

      const path = `/api/credit-card-invoices/${purchase.installments[0].invoice.uuid}/payments`;

      await wallet.agent
        .post(path)
        .send({
          accountUuid: wallet.bank,
          amount: '10.00',
          paidOn: BEFORE_OPENING,
        })
        .expect(BEFORE_OPENING_ERROR);

      await wallet.agent
        .post(path)
        .send({ accountUuid: wallet.bank, amount: '10.00' })
        .expect(BEFORE_OPENING_ERROR);

      await wallet.agent
        .post(path)
        .send({
          accountUuid: wallet.bank,
          amount: '10.00',
          paidOn: OPENING_DATE,
        })
        .expect(201);
    });

    it('rejects investment movements before the opening date', async () => {
      const wallet = await newWallet();
      const path = `/api/investments/${wallet.investment}/movements`;

      const movementBody = {
        type: 'CONTRIBUTION',
        accountUuid: wallet.bank,
        amount: '100.00',
        date: AFTER_OPENING,
        state: 'PLANNED',
      };

      await wallet.agent
        .post(path)
        .send({ ...movementBody, date: BEFORE_OPENING })
        .expect(BEFORE_OPENING_ERROR);

      await wallet.agent
        .post(path)
        .send({
          ...movementBody,
          state: 'COMPLETED',
          completedOn: BEFORE_OPENING,
        })
        .expect(BEFORE_OPENING_ERROR);

      const movement = uuidOf(
        await wallet.agent.post(path).send(movementBody).expect(201),
      );

      await wallet.agent
        .put(`${path}/${movement}/state`)
        .send({ state: 'COMPLETED', completedOn: BEFORE_OPENING })
        .expect(BEFORE_OPENING_ERROR);

      await wallet.agent
        .put(`${path}/${movement}/state`)
        .send({ state: 'COMPLETED', completedOn: AFTER_OPENING })
        .expect(200);
    });

    describe('recurrences', () => {
      const openedYesterday = addDaysToDate(TODAY, -1);

      function recurrenceBody(wallet: Wallet, startDate: string) {
        return {
          type: 'EXPENSE',
          description: 'Rent',
          amount: '50.00',
          frequency: 'MONTHLY',
          startDate,
          accountUuid: wallet.bank,
          categoryUuid: wallet.expense,
        };
      }

      async function occurrencesOf(wallet: Wallet, recurrence: string) {
        return dataOf<Occurrence[]>(
          await wallet.agent
            .get(`/api/recurrences/${recurrence}/occurrences?limit=50`)
            .expect(200),
        );
      }

      it('rejects a start date before the opening date on an account target', async () => {
        const wallet = await newWallet(openedYesterday);

        await wallet.agent
          .post('/api/recurrences')
          .send(recurrenceBody(wallet, addDaysToDate(openedYesterday, -1)))
          .expect(BEFORE_OPENING_ERROR);

        await wallet.agent
          .post('/api/recurrences')
          .send(recurrenceBody(wallet, openedYesterday))
          .expect(201);
      });

      it('rejects moving an occurrence or confirming it before the opening date', async () => {
        const wallet = await newWallet(openedYesterday);

        const recurrence = uuidOf(
          await wallet.agent
            .post('/api/recurrences')
            .send(recurrenceBody(wallet, TODAY))
            .expect(201),
        );

        const [occurrence] = await occurrencesOf(wallet, recurrence);
        const path = `/api/recurrences/${recurrence}/occurrences/${occurrence.uuid}`;
        const beforeOpening = addDaysToDate(openedYesterday, -1);

        await wallet.agent
          .patch(path)
          .send({ date: beforeOpening })
          .expect(BEFORE_OPENING_ERROR);

        await wallet.agent
          .put(`${path}/confirmation`)
          .send({ date: beforeOpening })
          .expect(BEFORE_OPENING_ERROR);

        await wallet.agent
          .put(`${path}/confirmation`)
          .send({ date: TODAY })
          .expect(200);
      });

      it('rejects moving planned occurrences to an account opened after them', async () => {
        const wallet = await newWallet(openedYesterday);

        const recurrence = uuidOf(
          await wallet.agent
            .post('/api/recurrences')
            .send(recurrenceBody(wallet, addDaysToDate(TODAY, 1)))
            .expect(201),
        );

        const late = uuidOf(
          await wallet.agent
            .post('/api/accounts')
            .send({
              name: 'Late',
              type: 'CHECKING',
              openingBalance: '0.00',
              openingBalanceDate: addMonthsToDate(TODAY, 2),
            })
            .expect(201),
        );

        await wallet.agent
          .patch(`/api/recurrences/${recurrence}`)
          .send({ scope: 'ALL', accountUuid: late })
          .expect(BEFORE_OPENING_ERROR);

        await wallet.agent
          .patch(`/api/recurrences/${recurrence}`)
          .send({ scope: 'ALL', accountUuid: wallet.savings })
          .expect(200);
      });

      it('never generates an occurrence before the opening date', async () => {
        const wallet = await newWallet(openedYesterday);
        const firstDate = addDaysToDate(TODAY, 1);

        const recurrence = uuidOf(
          await wallet.agent
            .post('/api/recurrences')
            .send(recurrenceBody(wallet, firstDate))
            .expect(201),
        );

        await wallet.agent
          .put(`/api/recurrences/${recurrence}/state`)
          .send({ state: 'PAUSED' })
          .expect(200);

        const opening = addMonthsToDate(firstDate, 2);

        await patchOpening(wallet, { openingBalanceDate: opening }).expect(200);

        await wallet.agent
          .put(`/api/recurrences/${recurrence}/state`)
          .send({ state: 'ACTIVE' })
          .expect(200);

        const occurrences = await occurrencesOf(wallet, recurrence);

        expect(occurrences.length).toBeGreaterThan(0);
        expect(occurrences[0].occurrenceDate).toBe(opening);

        const details = dataOf<{ nextOccurrenceDate: string }>(
          await wallet.agent.get(`/api/recurrences/${recurrence}`).expect(200),
        );

        expect(details.nextOccurrenceDate).toBe(opening);
      });
    });
  });

  describe('editing the opening date', () => {
    it('moves earlier at any time and later only up to the earliest operation', async () => {
      const wallet = await newWallet();

      await plannedExpense(wallet, { date: AFTER_OPENING });

      await patchOpening(wallet, { openingBalanceDate: '2030-01-01' }).expect(
        200,
      );

      await patchOpening(wallet, { openingBalanceDate: '2030-07-02' }).expect(
        BEFORE_OPENING_ERROR,
      );

      await patchOpening(wallet, { openingBalanceDate: AFTER_OPENING }).expect(
        200,
      );

      expect((await accountOf(wallet)).openingBalanceDate).toBe(AFTER_OPENING);
    });

    it('counts completed transactions by their earliest date, transfers from either side, payments, and movements', async () => {
      const blockedBy = async (
        record: (wallet: Wallet) => Promise<unknown>,
        entryDate: string,
      ) => {
        const wallet = await newWallet();

        await record(wallet);

        await patchOpening(wallet, {
          openingBalanceDate: addDaysToDate(entryDate, 1),
        }).expect(BEFORE_OPENING_ERROR);

        await patchOpening(wallet, { openingBalanceDate: entryDate }).expect(
          200,
        );
      };

      await blockedBy(
        (wallet) =>
          wallet.agent
            .post('/api/transactions')
            .send(
              expenseBody(wallet, {
                date: '2030-07-10',
                state: 'COMPLETED',
                completedOn: '2030-07-05',
              }),
            )
            .expect(201),
        '2030-07-05',
      );

      await blockedBy(
        (wallet) =>
          wallet.agent
            .post('/api/transactions')
            .send(
              transferBody(wallet, {
                accountUuid: wallet.savings,
                destinationAccountUuid: wallet.bank,
              }),
            )
            .expect(201),
        AFTER_OPENING,
      );

      await blockedBy(async (wallet) => {
        const purchase = dataOf<{
          installments: Array<{ invoice: { uuid: string } }>;
        }>(
          await wallet.agent
            .post('/api/credit-card-purchases')
            .send({
              cardUuid: wallet.card,
              categoryUuid: wallet.expense,
              description: 'Purchase',
              amount: '100.00',
              purchaseDate: AFTER_OPENING,
              installmentCount: 1,
            })
            .expect(201),
        );

        await wallet.agent
          .post(
            `/api/credit-card-invoices/${purchase.installments[0].invoice.uuid}/payments`,
          )
          .send({
            accountUuid: wallet.bank,
            amount: '10.00',
            paidOn: '2030-07-03',
          })
          .expect(201);
      }, '2030-07-03');

      await blockedBy(
        (wallet) =>
          wallet.agent
            .post(`/api/investments/${wallet.investment}/movements`)
            .send({
              type: 'CONTRIBUTION',
              accountUuid: wallet.bank,
              amount: '100.00',
              date: '2030-07-04',
              state: 'PLANNED',
            })
            .expect(201),
        '2030-07-04',
      );
    });

    it('ignores canceled and deleted operations', async () => {
      const wallet = await newWallet();

      const canceled = await plannedExpense(wallet);
      const deleted = await plannedExpense(wallet);

      await wallet.agent
        .put(`/api/transactions/${canceled}/state`)
        .send({ state: 'CANCELED' })
        .expect(200);

      await wallet.agent.delete(`/api/transactions/${deleted}`).expect(200);

      await patchOpening(wallet, { openingBalanceDate: '2030-12-01' }).expect(
        200,
      );
    });
  });

  describe('editing the opening amount', () => {
    it('shifts current and projected balances by the difference without rewriting operations', async () => {
      const wallet = await newWallet();

      const completed = uuidOf(
        await wallet.agent
          .post('/api/transactions')
          .send(expenseBody(wallet, { state: 'COMPLETED', amount: '100.00' }))
          .expect(201),
      );

      await plannedExpense(wallet, { amount: '50.00' });

      const dashboardRow = async () =>
        dataOf<Dashboard>(
          await wallet.agent
            .get('/api/dashboard?year=2030&month=7')
            .expect(200),
        ).accounts.find(({ uuid }) => uuid === wallet.bank);

      expect(await dashboardRow()).toMatchObject({
        actualBalance: '900.00',
        projectedBalance: '850.00',
      });

      const updated = dataOf<Account>(
        await patchOpening(wallet, { openingBalance: '1250.50' }).expect(200),
      );

      expect(updated.currentBalance).toBe('1150.50');
      expect(await dashboardRow()).toMatchObject({
        actualBalance: '1150.50',
        projectedBalance: '1100.50',
      });

      const transaction = dataOf<{
        amount: string;
        date: string;
        state: string;
      }>(await wallet.agent.get(`/api/transactions/${completed}`).expect(200));

      expect(transaction).toMatchObject({
        amount: '100.00',
        date: AFTER_OPENING,
        state: 'COMPLETED',
      });
    });
  });

  describe('records that predate these rules', () => {
    async function moveOpeningWithoutChecks(
      account: string,
      openingBalanceDate: string,
    ): Promise<void> {
      await app
        .get<DataSource>(getDataSourceToken())
        .query(
          'UPDATE accounts SET opening_balance_date = $1 WHERE uuid = $2',
          [openingBalanceDate, account],
        );
    }

    it('keeps counting them and allows edits that leave the date and account alone', async () => {
      const wallet = await newWallet('2030-01-01');

      const legacy = uuidOf(
        await wallet.agent
          .post('/api/transactions')
          .send(
            expenseBody(wallet, {
              date: '2030-02-01',
              state: 'COMPLETED',
              completedOn: '2030-02-01',
            }),
          )
          .expect(201),
      );

      await moveOpeningWithoutChecks(wallet.bank, '2030-03-01');

      expect((await accountOf(wallet)).currentBalance).toBe('900.00');

      await wallet.agent
        .patch(`/api/transactions/${legacy}`)
        .send({ description: 'Renamed' })
        .expect(200);

      await wallet.agent
        .patch(`/api/transactions/${legacy}`)
        .send({ date: '2030-02-01' })
        .expect(200);

      await patchOpening(wallet, { openingBalanceDate: '2030-04-01' }).expect(
        BEFORE_OPENING_ERROR,
      );
    });
  });
});
