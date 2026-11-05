import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  addDaysToDate,
  financeToday,
  lastDayOf,
  monthOf,
} from '@shared/domain/calendar';
import { type AuthAgent, createAuthAgent } from './helpers/auth-agent';
import { createTestApp } from './helpers/create-test-app';
import { createIsolatedUser } from './helpers/isolated-user';

interface PendingItem {
  uuid: string;
  description: string;
  type: string;
  overdue: boolean;
  future: boolean;
  confirmable: boolean;
  blockedReason: string | null;
  earliestCompletedOn: string;
}

interface Pending {
  items: PendingItem[];
  total: number;
}

interface BulkResult {
  results: Array<{
    uuid: string;
    outcome: string;
    message: string | null;
    transaction: { state: string; completedOn: string | null } | null;
  }>;
  confirmedCount: number;
  alreadyCompletedCount: number;
  failedCount: number;
}

interface Wallet {
  agent: AuthAgent;
  bank: string;
  savings: string;
  expense: string;
  card: string;
  investment: string;
}

const TODAY = financeToday();
const YESTERDAY = addDaysToDate(TODAY, -1);
const TOMORROW = addDaysToDate(TODAY, 1);
const OPENING = addDaysToDate(TODAY, -60);
const FAR = addDaysToDate(TODAY, 90);

function dataOf<T>(response: { body: unknown }): T {
  return (response.body as { data: T }).data;
}

const uuidOf = (response: { body: unknown }): string =>
  dataOf<{ uuid: string }>(response).uuid;

describe('Bulk transaction confirmation (e2e)', () => {
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

    const account = async (name: string, openingBalanceDate = OPENING) =>
      uuidOf(
        await agent
          .post('/api/accounts')
          .send({
            name,
            type: 'CHECKING',
            openingBalance: '1000.00',
            openingBalanceDate,
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

  async function planned(
    wallet: Wallet,
    body: Record<string, unknown> = {},
  ): Promise<string> {
    return uuidOf(
      await wallet.agent
        .post('/api/transactions')
        .send({
          type: 'EXPENSE',
          description: 'Market',
          amount: '10.00',
          date: YESTERDAY,
          state: 'PLANNED',
          accountUuid: wallet.bank,
          categoryUuid: wallet.expense,
          ...body,
        })
        .expect(201),
    );
  }

  async function pendingOf(wallet: Wallet, until = FAR): Promise<Pending> {
    return dataOf<Pending>(
      await wallet.agent
        .get(`/api/transactions/pending-confirmations?until=${until}`)
        .expect(200),
    );
  }

  function confirm(
    wallet: Wallet,
    items: Array<{ uuid: string; completedOn?: string }>,
  ) {
    return wallet.agent
      .post('/api/transactions/bulk-confirmation')
      .send({ items });
  }

  async function balanceOf(wallet: Wallet, account: string): Promise<string> {
    return dataOf<{ currentBalance: string }>(
      await wallet.agent.get(`/api/accounts/${account}`).expect(200),
    ).currentBalance;
  }

  describe('pending confirmations', () => {
    it('lists more than the dashboard preview, oldest first, with flags', async () => {
      const wallet = await newWallet();

      const overdue: string[] = [];

      for (let index = 0; index < 12; index += 1) {
        overdue.push(
          await planned(wallet, { date: addDaysToDate(TODAY, -(index + 1)) }),
        );
      }

      const current = await planned(wallet, { date: TODAY });
      const future = await planned(wallet, { date: TOMORROW });

      const pending = await pendingOf(wallet);

      expect(pending.total).toBe(14);
      expect(pending.items.map(({ uuid }) => uuid)).toEqual([
        ...[...overdue].reverse(),
        current,
        future,
      ]);
      expect(pending.items[0]).toMatchObject({
        overdue: true,
        future: false,
        confirmable: true,
        blockedReason: null,
        earliestCompletedOn: OPENING,
      });
      expect(pending.items[12]).toMatchObject({
        overdue: false,
        future: false,
      });
      expect(pending.items[13]).toMatchObject({ overdue: false, future: true });
    });

    it('stops at until and leaves out completed and canceled rows', async () => {
      const wallet = await newWallet();

      const inside = await planned(wallet, { date: TODAY });
      await planned(wallet, { date: addDaysToDate(TODAY, 2) });
      await planned(wallet, { state: 'COMPLETED' });

      const canceled = await planned(wallet);

      await wallet.agent
        .put(`/api/transactions/${canceled}/state`)
        .send({ state: 'CANCELED' })
        .expect(200);

      const pending = await pendingOf(wallet, TODAY);

      expect(pending.items.map(({ uuid }) => uuid)).toEqual([inside]);
    });

    it('never lists card charges or investment movements', async () => {
      const wallet = await newWallet();

      await wallet.agent
        .post('/api/recurrences')
        .send({
          type: 'EXPENSE',
          description: 'Streaming',
          amount: '20.00',
          frequency: 'MONTHLY',
          startDate: TODAY,
          creditCardUuid: wallet.card,
          categoryUuid: wallet.expense,
        })
        .expect(201);

      await wallet.agent
        .post(`/api/investments/${wallet.investment}/movements`)
        .send({
          type: 'CONTRIBUTION',
          accountUuid: wallet.bank,
          amount: '10.00',
          date: TODAY,
          state: 'PLANNED',
        })
        .expect(201);

      const transfer = await planned(wallet, {
        type: 'TRANSFER',
        categoryUuid: undefined,
        destinationAccountUuid: wallet.savings,
      });

      const pending = await pendingOf(wallet, lastDayOf(monthOf(FAR)));

      expect(pending.items.map(({ uuid }) => uuid)).toEqual([transfer]);
      expect(pending.items[0].type).toBe('TRANSFER');
    });

    it('flags inactive accounts and accounts not yet open', async () => {
      const wallet = await newWallet();

      const blocked = await planned(wallet);

      const later = addDaysToDate(TODAY, 30);

      const opensLater = uuidOf(
        await wallet.agent
          .post('/api/accounts')
          .send({
            name: 'Future',
            type: 'CHECKING',
            openingBalance: '0.00',
            openingBalanceDate: later,
          })
          .expect(201),
      );

      const notOpen = await planned(wallet, {
        accountUuid: opensLater,
        date: later,
      });

      await wallet.agent
        .put(`/api/accounts/${wallet.bank}/status`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      const pending = await pendingOf(wallet);

      expect(pending.items).toEqual([
        expect.objectContaining({
          uuid: blocked,
          confirmable: false,
          blockedReason: 'INACTIVE_ACCOUNT',
        }),
        expect.objectContaining({
          uuid: notOpen,
          confirmable: false,
          blockedReason: 'BEFORE_ACCOUNT_OPENING',
          earliestCompletedOn: later,
        }),
      ]);
    });

    it('requires a valid until', async () => {
      const wallet = await newWallet();

      await wallet.agent
        .get('/api/transactions/pending-confirmations')
        .expect(400);
      await wallet.agent
        .get('/api/transactions/pending-confirmations?until=nope')
        .expect(400);
    });
  });

  describe('bulk confirmation', () => {
    it('confirms more than ten items, changes balances, and honors dates', async () => {
      const wallet = await newWallet();
      const uuids: string[] = [];

      for (let index = 0; index < 12; index += 1) {
        uuids.push(await planned(wallet));
      }

      const custom = addDaysToDate(TODAY, -5);

      const result = dataOf<BulkResult>(
        await confirm(wallet, [
          { uuid: uuids[0], completedOn: custom },
          ...uuids.slice(1).map((uuid) => ({ uuid })),
        ]).expect(200),
      );

      expect(result).toMatchObject({
        confirmedCount: 12,
        alreadyCompletedCount: 0,
        failedCount: 0,
      });
      expect(result.results[0].transaction?.completedOn).toBe(custom);
      expect(result.results[1].transaction?.completedOn).toBe(TODAY);

      await expect(balanceOf(wallet, wallet.bank)).resolves.toBe('880.00');
      await expect(pendingOf(wallet)).resolves.toMatchObject({ total: 0 });
    });

    it('reports partial failures and keeps the rest', async () => {
      const wallet = await newWallet();
      const stranger = await newWallet();

      const good = await planned(wallet);
      const beforeOpening = await planned(wallet);
      const foreign = await planned(stranger);
      const canceled = await planned(wallet);
      const missing = '00000000-0000-4000-8000-000000000000';

      await wallet.agent
        .put(`/api/transactions/${canceled}/state`)
        .send({ state: 'CANCELED' })
        .expect(200);

      const result = dataOf<BulkResult>(
        await confirm(wallet, [
          { uuid: good },
          {
            uuid: beforeOpening,
            completedOn: addDaysToDate(OPENING, -1),
          },
          { uuid: foreign },
          { uuid: canceled },
          { uuid: missing },
        ]).expect(200),
      );

      expect(result).toMatchObject({ confirmedCount: 1, failedCount: 4 });
      expect(result.results.map(({ outcome }) => outcome)).toEqual([
        'CONFIRMED',
        'FAILED',
        'FAILED',
        'FAILED',
        'FAILED',
      ]);
      expect(result.results[1].message).toEqual(expect.any(String));
      expect(result.results[1].transaction).toBeNull();

      await expect(balanceOf(wallet, wallet.bank)).resolves.toBe('990.00');
      await expect(balanceOf(stranger, stranger.bank)).resolves.toBe('1000.00');

      const remaining = await pendingOf(wallet);

      expect(remaining.items.map(({ uuid }) => uuid)).toEqual([beforeOpening]);
    });

    it('fails an item on an inactive account', async () => {
      const wallet = await newWallet();

      const blocked = await planned(wallet);
      const open = await planned(wallet, { accountUuid: wallet.savings });

      await wallet.agent
        .put(`/api/accounts/${wallet.bank}/status`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      const result = dataOf<BulkResult>(
        await confirm(wallet, [{ uuid: blocked }, { uuid: open }]).expect(200),
      );

      expect(result.results.map(({ outcome }) => outcome)).toEqual([
        'FAILED',
        'CONFIRMED',
      ]);
    });

    it('is idempotent when repeated', async () => {
      const wallet = await newWallet();
      const uuid = await planned(wallet);

      await confirm(wallet, [{ uuid }]).expect(200);

      const repeated = dataOf<BulkResult>(
        await confirm(wallet, [{ uuid }]).expect(200),
      );

      expect(repeated).toMatchObject({
        confirmedCount: 0,
        alreadyCompletedCount: 1,
        failedCount: 0,
      });
      expect(repeated.results[0].transaction?.state).toBe('COMPLETED');

      await expect(balanceOf(wallet, wallet.bank)).resolves.toBe('990.00');
    });

    it('confirms each item once under concurrent requests', async () => {
      const wallet = await newWallet();

      const items = [
        { uuid: await planned(wallet) },
        { uuid: await planned(wallet) },
        { uuid: await planned(wallet) },
      ];

      const responses = await Promise.all([
        confirm(wallet, items),
        confirm(wallet, items),
        confirm(wallet, items),
      ]);

      const bodies = responses.map((response) => {
        expect(response.status).toBe(200);

        return dataOf<BulkResult>(response);
      });

      expect(
        bodies.reduce((total, body) => total + body.confirmedCount, 0),
      ).toBe(3);
      expect(
        bodies.reduce((total, body) => total + body.alreadyCompletedCount, 0),
      ).toBe(6);

      await expect(balanceOf(wallet, wallet.bank)).resolves.toBe('970.00');
    });

    it('rejects empty, duplicate, and oversized requests', async () => {
      const wallet = await newWallet();
      const uuid = await planned(wallet);

      await confirm(wallet, []).expect(400);
      await confirm(wallet, [{ uuid }, { uuid }]).expect(400);
      await confirm(
        wallet,
        Array.from({ length: 201 }, (_, index) => ({
          uuid: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        })),
      ).expect(400);
    });
  });
});
