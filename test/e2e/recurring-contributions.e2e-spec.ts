import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { GenerateDueRecurrenceOccurrencesUseCase } from '@modules/recurrences/application/use-cases/generate-due-recurrence-occurrences.use-case';
import {
  addDaysToDate,
  addMonthsToDate,
  financeToday,
  firstDayOf,
  lastDayOf,
  monthOf,
  shiftMonth,
  type MonthRef,
} from '@shared/domain/calendar';
import { type AuthAgent, createAuthAgent } from './helpers/auth-agent';
import { createTestApp } from './helpers/create-test-app';
import { createIsolatedUser } from './helpers/isolated-user';

interface Occurrence {
  uuid: string;
  occurrenceDate: string;
  date: string;
  amount: string;
  state: string;
  completedOn: string | null;
  movementUuid: string | null;
  transactionUuid: string | null;
}

interface Recurrence {
  uuid: string;
  type: string;
  typeLabel: string;
  category: unknown;
  investment: { uuid: string; name: string; status: string } | null;
  savingStrategy: {
    minimumRetainedBalance: string;
    additionalContribution: string;
    additionalContributionLabel: string;
  } | null;
  amount: string;
  state: string;
}

interface Movement {
  uuid: string;
  type: string;
  state: string;
  amount: string;
  date: string;
  completedOn: string | null;
  account: { uuid: string } | null;
  contributionKind: string;
  contributionKindLabel: string;
  recurrence: { uuid: string; occurrenceDate: string | null } | null;
  surplusMonth: string | null;
  suggestedAmount: string | null;
  retainedMinimum: string | null;
}

interface SavingPlan {
  recurrence: { uuid: string; state: string; amount: string };
  investment: { uuid: string };
  account: { uuid: string };
  month: string;
  actualBalance: string;
  plannedTransactions: string;
  otherInvestmentMovements: string;
  cardObligations: string;
  balanceBeforeContribution: string;
  minimumRetainedBalance: string;
  distributable: string;
  shortfall: string;
  additionalContribution: string;
  mandatory: {
    planned: string;
    completed: string;
    plannedOccurrences: Array<{
      uuid: string;
      date: string;
      amount: string;
      overdue: boolean;
    }>;
  };
  suggestedAdditional: string;
  additional: {
    movementUuid: string;
    amount: string;
    state: string;
    suggestedAmount: string;
  } | null;
  canAcceptAdditional: boolean;
}

interface Dashboard {
  balances: { actual: string; projected: string; available: string };
  income: { total: string };
  expenses: { total: string };
  creditCards: { outstanding: string; plannedDue: string };
  investments: {
    contributions: { total: string; completed: string; pending: string };
    contributionBreakdown: Record<string, string>;
    savingPlans: SavingPlan[];
  };
}

interface Wallet {
  agent: AuthAgent;
  bank: string;
  reserve: string;
}

function dataOf<T>(response: { body: unknown }): T {
  return (response.body as { data: T }).data;
}

const uuidOf = (response: { body: unknown }): string =>
  dataOf<{ uuid: string }>(response).uuid;

const REMAINING_SURPLUS = {
  minimumRetainedBalance: '200.00',
  additionalContribution: 'REMAINING_SURPLUS',
};

describe('Recurring investment contributions (e2e)', () => {
  let app: INestApplication<App>;

  const today = financeToday();
  const thisMonth = monthOf(today);
  const nextMonth = shiftMonth(thisMonth, 1);
  const lastMonth = shiftMonth(thisMonth, -1);
  const opening = addMonthsToDate(today, -3);

  const query = ({ year, month }: MonthRef): string =>
    `year=${year}&month=${month}`;

  beforeAll(async () => {
    process.env.THROTTLE_LIMIT = '100000';
    process.env.AUTH_THROTTLE_LIMIT = '100000';
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function wallet(openingBalance = '1500.00'): Promise<Wallet> {
    const agent = await createAuthAgent(app, await createIsolatedUser(app));

    const bank = uuidOf(
      await agent
        .post('/api/accounts')
        .send({
          name: 'Bank',
          type: 'CHECKING',
          openingBalance,
          openingBalanceDate: opening,
        })
        .expect(201),
    );

    const reserve = uuidOf(
      await agent
        .post('/api/investments')
        .send({ name: 'Reserve', type: 'RESERVE' })
        .expect(201),
    );

    return { agent, bank, reserve };
  }

  const contributionBody = (
    { bank, reserve }: Wallet,
    overrides: Record<string, unknown> = {},
  ) => ({
    type: 'INVESTMENT_CONTRIBUTION',
    description: 'Monthly reserve',
    amount: '700.00',
    frequency: 'MONTHLY',
    startDate: today,
    accountUuid: bank,
    investmentUuid: reserve,
    savingStrategy: REMAINING_SURPLUS,
    ...overrides,
  });

  async function contribution(
    owner: Wallet,
    overrides: Record<string, unknown> = {},
  ): Promise<Recurrence> {
    return dataOf<Recurrence>(
      await owner.agent
        .post('/api/recurrences')
        .send(contributionBody(owner, overrides))
        .expect(201),
    );
  }

  async function occurrencesOf(
    { agent }: Wallet,
    recurrence: string,
  ): Promise<Occurrence[]> {
    return dataOf<Occurrence[]>(
      await agent
        .get(`/api/recurrences/${recurrence}/occurrences?limit=50`)
        .expect(200),
    );
  }

  async function movementsOf({ agent, reserve }: Wallet): Promise<Movement[]> {
    return dataOf<Movement[]>(
      await agent
        .get(`/api/investments/${reserve}/movements?limit=50`)
        .expect(200),
    );
  }

  async function balanceOf({ agent, bank }: Wallet): Promise<string> {
    return dataOf<{ currentBalance: string }>(
      await agent.get(`/api/accounts/${bank}`).expect(200),
    ).currentBalance;
  }

  async function valueOf({ agent, reserve }: Wallet): Promise<string> {
    return dataOf<{ currentValue: string }>(
      await agent.get(`/api/investments/${reserve}`).expect(200),
    ).currentValue;
  }

  async function planOf(
    { agent }: Wallet,
    month: MonthRef = thisMonth,
  ): Promise<SavingPlan> {
    const plans = dataOf<SavingPlan[]>(
      await agent
        .get(`/api/recurrences/saving-plans?${query(month)}`)
        .expect(200),
    );

    expect(plans).toHaveLength(1);

    return plans[0];
  }

  async function dashboardOf(
    { agent }: Wallet,
    month: MonthRef = thisMonth,
  ): Promise<Dashboard> {
    return dataOf<Dashboard>(
      await agent.get(`/api/dashboard?${query(month)}`).expect(200),
    );
  }

  const accept = (
    { agent }: Wallet,
    recurrence: string,
    body: Record<string, unknown>,
  ) =>
    agent.post(`/api/recurrences/${recurrence}/additional-contributions`).send({
      year: thisMonth.year,
      month: thisMonth.month,
      amount: '600.00',
      state: 'PLANNED',
      ...body,
    });

  async function plansOf(
    { agent }: Wallet,
    month: MonthRef = thisMonth,
  ): Promise<SavingPlan[]> {
    return dataOf<SavingPlan[]>(
      await agent
        .get(`/api/recurrences/saving-plans?${query(month)}`)
        .expect(200),
    );
  }

  async function savingsOf({ agent }: Wallet): Promise<string> {
    return uuidOf(
      await agent
        .post('/api/accounts')
        .send({
          name: 'Savings',
          type: 'SAVINGS',
          openingBalance: '0.00',
          openingBalanceDate: opening,
        })
        .expect(201),
    );
  }

  async function plannedRowsOf(
    owner: Wallet,
  ): Promise<Array<{ uuid: string; amount: string; account: string }>> {
    const rows = await movementsOf(owner);

    return rows
      .map(({ uuid, amount, account }) => ({
        uuid,
        amount,
        account: account?.uuid ?? '',
      }))
      .sort((left, right) => left.uuid.localeCompare(right.uuid));
  }

  async function liveMovementCount(investment: string): Promise<number> {
    const [{ count }] = await app
      .get<DataSource>(getDataSourceToken())
      .query<Array<{ count: string }>>(
        `SELECT count(*) FROM investment_movements m
         JOIN investments i ON i.id = m.investment_id
         WHERE i.uuid = $1 AND m.deleted_at IS NULL`,
        [investment],
      );

    return Number(count);
  }

  const setState = ({ agent }: Wallet, recurrence: string, state: string) =>
    agent
      .put(`/api/recurrences/${recurrence}/state`)
      .send({ state })
      .expect(200);

  const generateDue = (date: string = today): Promise<number> =>
    app.get(GenerateDueRecurrenceOccurrencesUseCase).execute(date);

  describe('creation', () => {
    it('creates a contribution recurrence without a category and links the investment', async () => {
      const owner = await wallet();

      const recurrence = await contribution(owner);

      expect(recurrence).toMatchObject({
        type: 'INVESTMENT_CONTRIBUTION',
        category: null,
        investment: { uuid: owner.reserve, name: 'Reserve', status: 'ACTIVE' },
        savingStrategy: {
          minimumRetainedBalance: '200.00',
          additionalContribution: 'REMAINING_SURPLUS',
        },
      });
      expect(recurrence.typeLabel).not.toBe('INVESTMENT_CONTRIBUTION');
    });

    it.each([
      ['investmentUuid missing', { investmentUuid: undefined }],
      ['accountUuid missing', { accountUuid: undefined }],
      [
        'category sent',
        { categoryUuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
      ],
      ['card sent', { creditCardUuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' }],
      [
        'negative retained balance',
        {
          savingStrategy: {
            minimumRetainedBalance: '-1.00',
            additionalContribution: 'NONE',
          },
        },
      ],
      [
        'unknown additional strategy',
        {
          savingStrategy: {
            minimumRetainedBalance: '1.00',
            additionalContribution: 'ALL',
          },
        },
      ],
    ])('rejects a body with %s', async (_, overrides) => {
      const owner = await wallet();

      await owner.agent
        .post('/api/recurrences')
        .send(contributionBody(owner, overrides))
        .expect(400);
    });

    it('refuses a saving strategy outside a monthly contribution', async () => {
      const owner = await wallet();

      await owner.agent
        .post('/api/recurrences')
        .send(contributionBody(owner, { frequency: 'WEEKLY' }))
        .expect(422);

      const category = uuidOf(
        await owner.agent
          .post('/api/transaction-categories')
          .send({ name: 'Rent', kind: 'EXPENSE' })
          .expect(201),
      );

      await owner.agent
        .post('/api/recurrences')
        .send({
          type: 'EXPENSE',
          description: 'Rent',
          amount: '10.00',
          frequency: 'MONTHLY',
          startDate: today,
          accountUuid: owner.bank,
          categoryUuid: category,
          savingStrategy: REMAINING_SURPLUS,
        })
        .expect(422);
    });

    it('needs an active investment and an active account', async () => {
      const archivedInvestment = await wallet();

      await archivedInvestment.agent
        .put(`/api/investments/${archivedInvestment.reserve}/status`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      await archivedInvestment.agent
        .post('/api/recurrences')
        .send(contributionBody(archivedInvestment))
        .expect(409);

      const inactiveAccount = await wallet();

      await inactiveAccount.agent
        .put(`/api/accounts/${inactiveAccount.bank}/status`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      await inactiveAccount.agent
        .post('/api/recurrences')
        .send(contributionBody(inactiveAccount))
        .expect(409);
    });

    it('rejects a category and ignores an investment change through PATCH', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);

      const category = uuidOf(
        await owner.agent
          .post('/api/transaction-categories')
          .send({ name: 'Rent', kind: 'EXPENSE' })
          .expect(201),
      );

      await owner.agent
        .patch(`/api/recurrences/${recurrence.uuid}`)
        .send({ scope: 'ALL', categoryUuid: category })
        .expect(422);

      const other = uuidOf(
        await owner.agent
          .post('/api/investments')
          .send({ name: 'Other', type: 'GOAL' })
          .expect(201),
      );

      const kept = dataOf<Recurrence>(
        await owner.agent
          .patch(`/api/recurrences/${recurrence.uuid}`)
          .send({ scope: 'ALL', investmentUuid: other })
          .expect(200),
      );

      expect(kept.investment?.uuid).toBe(owner.reserve);
    });
  });

  describe('generation', () => {
    it('generates planned mandatory movements without moving money or duplicating', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);

      const occurrences = await occurrencesOf(owner, recurrence.uuid);

      expect(occurrences.length).toBeGreaterThanOrEqual(13);
      expect(occurrences[0]).toMatchObject({
        occurrenceDate: today,
        date: today,
        amount: '700.00',
        state: 'PLANNED',
        completedOn: null,
        transactionUuid: null,
      });
      expect(occurrences[0].movementUuid).toBe(occurrences[0].uuid);

      const movements = await movementsOf(owner);

      expect(movements).toHaveLength(occurrences.length);
      expect(movements[0]).toMatchObject({
        type: 'CONTRIBUTION',
        contributionKind: 'MANDATORY',
        recurrence: { uuid: recurrence.uuid },
        surplusMonth: null,
        suggestedAmount: null,
        retainedMinimum: null,
      });

      expect(movements[0].contributionKindLabel).not.toBe('MANDATORY');

      await expect(balanceOf(owner)).resolves.toBe('1500.00');
      await expect(valueOf(owner)).resolves.toBe('0.00');

      await generateDue();
      await generateDue(addMonthsToDate(today, 2));

      const afterJob = await occurrencesOf(owner, recurrence.uuid);

      expect(afterJob.length).toBeGreaterThanOrEqual(occurrences.length);
      expect(new Set(afterJob.map((o) => o.occurrenceDate)).size).toBe(
        afterJob.length,
      );
    });

    it('rejects a start before the opening of the account', async () => {
      const owner = await wallet();

      await owner.agent
        .post('/api/recurrences')
        .send(
          contributionBody(owner, { startDate: addDaysToDate(opening, -1) }),
        )
        .expect(422);
    });

    it('lowers the projected balance and is neither income nor expense', async () => {
      const owner = await wallet();

      await contribution(owner);

      const dashboard = await dashboardOf(owner);

      expect(dashboard.balances).toMatchObject({
        actual: '1500.00',
        projected: '800.00',
      });
      expect(dashboard.income.total).toBe('0.00');
      expect(dashboard.expenses.total).toBe('0.00');
      expect(dashboard.investments.contributions.pending).toBe('700.00');
      expect(dashboard.investments.contributionBreakdown).toMatchObject({
        mandatoryPlanned: '700.00',
        mandatoryCompleted: '0.00',
        additionalPlanned: '0.00',
        additionalCompleted: '0.00',
        oneTimePlanned: '0.00',
        oneTimeCompleted: '0.00',
      });

      const transactions = await owner.agent
        .get('/api/transactions')
        .expect(200);

      expect(dataOf<unknown[]>(transactions)).toEqual([]);
    });
  });

  describe('occurrences', () => {
    it('confirms one occurrence once, moving the money and keeping its scheduled date', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);
      const [first, second] = await occurrencesOf(owner, recurrence.uuid);

      const confirmed = dataOf<Occurrence>(
        await owner.agent
          .put(
            `/api/recurrences/${recurrence.uuid}/occurrences/${first.uuid}/confirmation`,
          )
          .send({})
          .expect(200),
      );

      expect(confirmed).toMatchObject({
        state: 'COMPLETED',
        date: today,
        completedOn: today,
        movementUuid: first.uuid,
      });

      await expect(balanceOf(owner)).resolves.toBe('800.00');
      await expect(valueOf(owner)).resolves.toBe('700.00');

      await owner.agent
        .put(
          `/api/recurrences/${recurrence.uuid}/occurrences/${first.uuid}/confirmation`,
        )
        .send({})
        .expect(409);

      await expect(balanceOf(owner)).resolves.toBe('800.00');

      const later = dataOf<Occurrence>(
        await owner.agent
          .put(
            `/api/recurrences/${recurrence.uuid}/occurrences/${second.uuid}/confirmation`,
          )
          .send({ amount: '100.00' })
          .expect(200),
      );

      expect(later).toMatchObject({
        state: 'COMPLETED',
        amount: '100.00',
        date: second.date,
        completedOn: today,
      });
    });

    it('cancels and edits single occurrences; a canceled date is never regenerated', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);
      const [first, second] = await occurrencesOf(owner, recurrence.uuid);

      await owner.agent
        .put(
          `/api/recurrences/${recurrence.uuid}/occurrences/${first.uuid}/cancellation`,
        )
        .expect(200);

      const edited = dataOf<Occurrence>(
        await owner.agent
          .patch(
            `/api/recurrences/${recurrence.uuid}/occurrences/${second.uuid}`,
          )
          .send({ amount: '650.00' })
          .expect(200),
      );

      expect(edited).toMatchObject({
        state: 'PLANNED',
        amount: '650.00',
        occurrenceDate: second.occurrenceDate,
      });

      await owner.agent
        .put(`/api/recurrences/${recurrence.uuid}/state`)
        .send({ state: 'PAUSED' })
        .expect(200);

      await owner.agent
        .put(`/api/recurrences/${recurrence.uuid}/state`)
        .send({ state: 'ACTIVE' })
        .expect(200);

      const occurrences = await occurrencesOf(owner, recurrence.uuid);

      expect(
        occurrences.filter((o) => o.occurrenceDate === first.occurrenceDate),
      ).toEqual([expect.objectContaining({ state: 'CANCELED' })]);

      await expect(balanceOf(owner)).resolves.toBe('1500.00');
    });

    it('completes and cancels occurrences through the investment state route too', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);
      const [first, second] = await occurrencesOf(owner, recurrence.uuid);

      await owner.agent
        .put(`/api/investments/${owner.reserve}/movements/${first.uuid}/state`)
        .send({ state: 'COMPLETED' })
        .expect(200);

      await owner.agent
        .put(`/api/investments/${owner.reserve}/movements/${second.uuid}/state`)
        .send({ state: 'CANCELED' })
        .expect(200);

      const [completed, canceled] = await occurrencesOf(owner, recurrence.uuid);

      expect(completed.state).toBe('COMPLETED');
      expect(canceled.state).toBe('CANCELED');
      await expect(balanceOf(owner)).resolves.toBe('800.00');
    });

    it('answers 404 to an additional contribution as an occurrence', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);

      const additional = dataOf<Movement>(
        await accept(owner, recurrence.uuid, {}).expect(201),
      );

      await owner.agent
        .put(
          `/api/recurrences/${recurrence.uuid}/occurrences/${additional.uuid}/cancellation`,
        )
        .expect(404);
    });
  });

  describe('pause, resume, end, and edit scope', () => {
    it('pause removes future planned rows only, resume regenerates, and accepted additional rows stay', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);
      const [first] = await occurrencesOf(owner, recurrence.uuid);

      await owner.agent
        .put(
          `/api/recurrences/${recurrence.uuid}/occurrences/${first.uuid}/confirmation`,
        )
        .send({})
        .expect(200);

      const additional = dataOf<Movement>(
        await accept(owner, recurrence.uuid, {}).expect(201),
      );

      await owner.agent
        .put(`/api/recurrences/${recurrence.uuid}/state`)
        .send({ state: 'PAUSED' })
        .expect(200);

      const paused = await occurrencesOf(owner, recurrence.uuid);

      expect(paused).toEqual([
        expect.objectContaining({ uuid: first.uuid, state: 'COMPLETED' }),
      ]);
      expect((await movementsOf(owner)).map((m) => m.uuid)).toEqual(
        expect.arrayContaining([additional.uuid, first.uuid]),
      );
      expect((await movementsOf(owner)).length).toBe(2);

      await owner.agent
        .put(`/api/recurrences/${recurrence.uuid}/state`)
        .send({ state: 'ACTIVE' })
        .expect(200);

      const resumed = await occurrencesOf(owner, recurrence.uuid);

      expect(resumed.length).toBeGreaterThan(1);
      expect(resumed[0]).toMatchObject({
        uuid: first.uuid,
        state: 'COMPLETED',
      });
      expect(resumed.slice(1).every((o) => o.state === 'PLANNED')).toBe(true);
    });

    it('end keeps what is up to today and removes the planned rows after it', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);

      const ended = dataOf<Recurrence>(
        await owner.agent
          .put(`/api/recurrences/${recurrence.uuid}/end`)
          .send({})
          .expect(200),
      );

      expect(ended.state).toBe('ENDED');

      const occurrences = await occurrencesOf(owner, recurrence.uuid);

      expect(occurrences.map((o) => o.occurrenceDate)).toEqual([today]);

      await owner.agent
        .put(
          `/api/recurrences/${recurrence.uuid}/occurrences/${occurrences[0].uuid}/confirmation`,
        )
        .send({})
        .expect(200);

      const plans = await owner.agent
        .get(`/api/recurrences/saving-plans?${query(thisMonth)}`)
        .expect(200);

      expect(dataOf<unknown[]>(plans)).toEqual([]);
    });

    it('applies the edit scope to planned rows and never changes completed history', async () => {
      const owner = await wallet();

      const savings = uuidOf(
        await owner.agent
          .post('/api/accounts')
          .send({
            name: 'Savings',
            type: 'SAVINGS',
            openingBalance: '0.00',
            openingBalanceDate: opening,
          })
          .expect(201),
      );

      const recurrence = await contribution(owner);

      const [first, second, third] = await occurrencesOf(
        owner,
        recurrence.uuid,
      );

      await owner.agent
        .put(
          `/api/recurrences/${recurrence.uuid}/occurrences/${first.uuid}/confirmation`,
        )
        .send({})
        .expect(200);

      await owner.agent
        .patch(`/api/recurrences/${recurrence.uuid}`)
        .send({
          scope: 'FUTURE',
          from: third.occurrenceDate,
          amount: '900.00',
          accountUuid: savings,
          savingStrategy: null,
        })
        .expect(200);

      const scoped = await occurrencesOf(owner, recurrence.uuid);

      expect(scoped[0]).toMatchObject({ state: 'COMPLETED', amount: '700.00' });
      expect(scoped[1]).toMatchObject({ uuid: second.uuid, amount: '700.00' });
      expect(scoped[2]).toMatchObject({ uuid: third.uuid, amount: '900.00' });

      const updated = dataOf<Recurrence>(
        await owner.agent
          .get(`/api/recurrences/${recurrence.uuid}`)
          .expect(200),
      );

      expect(updated).toMatchObject({ amount: '900.00', savingStrategy: null });

      await owner.agent
        .patch(`/api/recurrences/${recurrence.uuid}`)
        .send({ scope: 'ALL', amount: '950.00' })
        .expect(200);

      const all = await occurrencesOf(owner, recurrence.uuid);

      expect(all[0]).toMatchObject({ state: 'COMPLETED', amount: '700.00' });
      expect(all.slice(1).every((o) => o.amount === '950.00')).toBe(true);

      await expect(balanceOf(owner)).resolves.toBe('800.00');
      await expect(valueOf(owner)).resolves.toBe('700.00');
    });

    async function plannedRowsAcrossAccounts(owner: Wallet) {
      const savings = await savingsOf(owner);

      const recurrence = await contribution(owner, {
        startDate: addMonthsToDate(today, -1),
      });

      const [overdue, edited, untouched] = await occurrencesOf(
        owner,
        recurrence.uuid,
      );

      await owner.agent
        .patch(`/api/recurrences/${recurrence.uuid}/occurrences/${edited.uuid}`)
        .send({ amount: '123.00' })
        .expect(200);

      await owner.agent
        .patch(`/api/recurrences/${recurrence.uuid}`)
        .send({
          scope: 'FUTURE',
          from: edited.occurrenceDate,
          accountUuid: savings,
        })
        .expect(200);

      return { savings, recurrence, overdue, edited, untouched };
    }

    it('keeps planned rows when a PATCH sends neither amount nor account', async () => {
      const owner = await wallet();

      const { recurrence, overdue, edited, savings } =
        await plannedRowsAcrossAccounts(owner);

      const before = await plannedRowsOf(owner);

      expect(before.find(({ uuid }) => uuid === overdue.uuid)).toMatchObject({
        amount: '700.00',
        account: owner.bank,
      });
      expect(before.find(({ uuid }) => uuid === edited.uuid)).toMatchObject({
        amount: '123.00',
        account: savings,
      });

      for (const change of [
        { savingStrategy: null },
        { savingStrategy: REMAINING_SURPLUS },
        { notes: 'Rainy day' },
        { description: 'Renamed reserve' },
      ]) {
        await owner.agent
          .patch(`/api/recurrences/${recurrence.uuid}`)
          .send({ scope: 'ALL', ...change })
          .expect(200);

        await expect(plannedRowsOf(owner)).resolves.toEqual(before);
      }
    });

    it('applies only the sent amount or account to each planned row', async () => {
      const owner = await wallet();

      const { recurrence, overdue, edited, untouched, savings } =
        await plannedRowsAcrossAccounts(owner);

      await owner.agent
        .patch(`/api/recurrences/${recurrence.uuid}`)
        .send({ scope: 'ALL', accountUuid: owner.bank })
        .expect(200);

      const moved = await plannedRowsOf(owner);

      expect(moved.every(({ account }) => account === owner.bank)).toBe(true);
      expect(moved.find(({ uuid }) => uuid === edited.uuid)?.amount).toBe(
        '123.00',
      );
      expect(moved.find(({ uuid }) => uuid === untouched.uuid)?.amount).toBe(
        '700.00',
      );

      await owner.agent
        .patch(`/api/recurrences/${recurrence.uuid}`)
        .send({
          scope: 'FUTURE',
          from: edited.occurrenceDate,
          accountUuid: savings,
        })
        .expect(200);

      await owner.agent
        .patch(`/api/recurrences/${recurrence.uuid}`)
        .send({ scope: 'ALL', amount: '900.00' })
        .expect(200);

      const repriced = await plannedRowsOf(owner);

      expect(repriced.every(({ amount }) => amount === '900.00')).toBe(true);
      expect(repriced.find(({ uuid }) => uuid === overdue.uuid)?.account).toBe(
        owner.bank,
      );
      expect(repriced.find(({ uuid }) => uuid === edited.uuid)?.account).toBe(
        savings,
      );
    });
  });

  describe('archived investment and inactive account', () => {
    it('keeps planned rows confirmable on KEEP and stops generation', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);
      const before = await occurrencesOf(owner, recurrence.uuid);

      await owner.agent
        .put(`/api/investments/${owner.reserve}/status`)
        .send({ status: 'INACTIVE', pendingOperations: 'KEEP' })
        .expect(200);

      await generateDue(addMonthsToDate(today, 3));

      const after = await occurrencesOf(owner, recurrence.uuid);

      expect(after).toHaveLength(before.length);

      await owner.agent
        .put(
          `/api/recurrences/${recurrence.uuid}/occurrences/${before[0].uuid}/confirmation`,
        )
        .send({})
        .expect(200);

      await expect(balanceOf(owner)).resolves.toBe('800.00');

      const plans = await owner.agent
        .get(`/api/recurrences/saving-plans?${query(thisMonth)}`)
        .expect(200);

      expect(dataOf<unknown[]>(plans)).toEqual([]);

      await accept(owner, recurrence.uuid, {}).expect(409);
    });

    it('cancels planned rows on CANCEL and never regenerates them', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);

      await owner.agent
        .put(`/api/investments/${owner.reserve}/status`)
        .send({ status: 'INACTIVE', pendingOperations: 'CANCEL' })
        .expect(200);

      const canceled = await occurrencesOf(owner, recurrence.uuid);

      expect(canceled.every((o) => o.state === 'CANCELED')).toBe(true);

      await owner.agent
        .put(`/api/investments/${owner.reserve}/status`)
        .send({ status: 'ACTIVE' })
        .expect(200);

      await owner.agent
        .put(`/api/recurrences/${recurrence.uuid}/state`)
        .send({ state: 'PAUSED' })
        .expect(200);

      await owner.agent
        .put(`/api/recurrences/${recurrence.uuid}/state`)
        .send({ state: 'ACTIVE' })
        .expect(200);

      const afterResume = await occurrencesOf(owner, recurrence.uuid);

      expect(
        afterResume.filter((o) =>
          canceled.some((c) => c.occurrenceDate === o.occurrenceDate),
        ),
      ).toEqual(canceled);
      expect(
        afterResume.filter(
          (o) => o.occurrenceDate === canceled[0].occurrenceDate,
        ),
      ).toHaveLength(1);
    });

    it('needs an active account to confirm, and hides the plan while it is inactive', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);
      const [first] = await occurrencesOf(owner, recurrence.uuid);

      await owner.agent
        .put(`/api/accounts/${owner.bank}/status`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      await owner.agent
        .put(
          `/api/recurrences/${recurrence.uuid}/occurrences/${first.uuid}/confirmation`,
        )
        .send({})
        .expect(409);

      const plans = await owner.agent
        .get(`/api/recurrences/saving-plans?${query(thisMonth)}`)
        .expect(200);

      expect(dataOf<unknown[]>(plans)).toEqual([]);
    });
  });

  describe('deleted investment and account', () => {
    async function withoutPlannedRows(owner: Wallet): Promise<Recurrence> {
      const recurrence = await contribution(owner);

      await setState(owner, recurrence.uuid, 'PAUSED');

      return recurrence;
    }

    it('refuses an additional contribution to a deleted investment and moves nothing', async () => {
      const owner = await wallet();
      const recurrence = await withoutPlannedRows(owner);

      await owner.agent.delete(`/api/investments/${owner.reserve}`).expect(200);
      await setState(owner, recurrence.uuid, 'ACTIVE');

      await accept(owner, recurrence.uuid, { state: 'COMPLETED' }).expect(409);

      await expect(liveMovementCount(owner.reserve)).resolves.toBe(0);
      await expect(balanceOf(owner)).resolves.toBe('1500.00');
      await expect(plansOf(owner)).resolves.toEqual([]);
    });

    it('refuses an additional contribution from a deleted account and moves nothing', async () => {
      const owner = await wallet();
      const recurrence = await withoutPlannedRows(owner);

      await owner.agent.delete(`/api/accounts/${owner.bank}`).expect(200);
      await setState(owner, recurrence.uuid, 'ACTIVE');

      await accept(owner, recurrence.uuid, { state: 'COMPLETED' }).expect(409);

      await expect(liveMovementCount(owner.reserve)).resolves.toBe(0);
      await expect(valueOf(owner)).resolves.toBe('0.00');
      await expect(plansOf(owner)).resolves.toEqual([]);
    });
  });

  describe('saving plans', () => {
    it('follows the worked example from suggestion to acceptance', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);

      const initial = await planOf(owner);

      expect(initial).toMatchObject({
        recurrence: {
          uuid: recurrence.uuid,
          state: 'ACTIVE',
          amount: '700.00',
        },
        investment: { uuid: owner.reserve },
        account: { uuid: owner.bank },
        month: firstDayOf(thisMonth),
        actualBalance: '1500.00',
        plannedTransactions: '0.00',
        otherInvestmentMovements: '0.00',
        cardObligations: '0.00',
        balanceBeforeContribution: '1500.00',
        minimumRetainedBalance: '200.00',
        distributable: '1300.00',
        shortfall: '0.00',
        additionalContribution: 'REMAINING_SURPLUS',
        suggestedAdditional: '600.00',
        additional: null,
        canAcceptAdditional: true,
      });
      expect(initial.mandatory).toMatchObject({
        planned: '700.00',
        completed: '0.00',
      });
      expect(initial.mandatory.plannedOccurrences).toEqual([
        expect.objectContaining({
          date: today,
          amount: '700.00',
          overdue: false,
        }),
      ]);

      await owner.agent
        .put(
          `/api/recurrences/${recurrence.uuid}/occurrences/${initial.mandatory.plannedOccurrences[0].uuid}/confirmation`,
        )
        .send({})
        .expect(200);

      const confirmed = await planOf(owner);

      expect(confirmed).toMatchObject({
        actualBalance: '800.00',
        distributable: '600.00',
        suggestedAdditional: '600.00',
        shortfall: '0.00',
      });
      expect(confirmed.mandatory).toMatchObject({
        planned: '0.00',
        completed: '700.00',
        plannedOccurrences: [],
      });

      const additional = dataOf<Movement>(
        await accept(owner, recurrence.uuid, {}).expect(201),
      );

      expect(additional).toMatchObject({
        type: 'CONTRIBUTION',
        contributionKind: 'ADDITIONAL',
        state: 'PLANNED',
        amount: '600.00',
        date: today,
        completedOn: null,
        recurrence: { uuid: recurrence.uuid, occurrenceDate: null },
        surplusMonth: firstDayOf(thisMonth),
        suggestedAmount: '600.00',
        retainedMinimum: '200.00',
      });

      const accepted = await planOf(owner);

      expect(accepted).toMatchObject({
        otherInvestmentMovements: '-600.00',
        balanceBeforeContribution: '200.00',
        distributable: '0.00',
        suggestedAdditional: '0.00',
        canAcceptAdditional: false,
        additional: {
          movementUuid: additional.uuid,
          amount: '600.00',
          state: 'PLANNED',
          suggestedAmount: '600.00',
        },
      });
    });

    it('matches the design figures when the additional is accepted before confirming the mandatory', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);

      await accept(owner, recurrence.uuid, {}).expect(201);

      expect(await planOf(owner)).toMatchObject({
        balanceBeforeContribution: '900.00',
        distributable: '700.00',
        shortfall: '0.00',
        suggestedAdditional: '0.00',
      });
    });

    it('counts other investments and planned transactions without double counting the own mandatory', async () => {
      const owner = await wallet();

      await contribution(owner);

      const goal = uuidOf(
        await owner.agent
          .post('/api/investments')
          .send({ name: 'Goal', type: 'GOAL' })
          .expect(201),
      );

      await owner.agent
        .post(`/api/investments/${goal}/movements`)
        .send({
          type: 'CONTRIBUTION',
          accountUuid: owner.bank,
          amount: '100.00',
          date: today,
          state: 'PLANNED',
        })
        .expect(201);

      const category = uuidOf(
        await owner.agent
          .post('/api/transaction-categories')
          .send({ name: 'Rent', kind: 'EXPENSE' })
          .expect(201),
      );

      await owner.agent
        .post('/api/transactions')
        .send({
          type: 'EXPENSE',
          description: 'Rent',
          amount: '50.00',
          date: today,
          state: 'PLANNED',
          accountUuid: owner.bank,
          categoryUuid: category,
        })
        .expect(201);

      expect(await planOf(owner)).toMatchObject({
        plannedTransactions: '-50.00',
        otherInvestmentMovements: '-100.00',
        balanceBeforeContribution: '1350.00',
        distributable: '1150.00',
        suggestedAdditional: '450.00',
        shortfall: '0.00',
      });
    });

    it('charges the dashboard card obligations against the account', async () => {
      const owner = await wallet();

      await contribution(owner);

      const card = uuidOf(
        await owner.agent
          .post('/api/credit-cards')
          .send({
            name: 'Visa',
            creditLimit: '5000.00',
            closingDay: 10,
            dueDay: 20,
          })
          .expect(201),
      );

      const category = uuidOf(
        await owner.agent
          .post('/api/transaction-categories')
          .send({ name: 'Market', kind: 'EXPENSE' })
          .expect(201),
      );

      const purchase = dataOf<{
        installments: Array<{ invoice: { referenceMonth: string } }>;
      }>(
        await owner.agent
          .post('/api/credit-card-purchases')
          .send({
            cardUuid: card,
            description: 'Market',
            amount: '300.00',
            purchaseDate: today,
            installmentCount: 1,
            categoryUuid: category,
          })
          .expect(201),
      );

      const month = monthOf(purchase.installments[0].invoice.referenceMonth);

      const dashboard = await dashboardOf(owner, month);
      const plan = dashboard.investments.savingPlans[0];

      expect(dashboard.creditCards.outstanding).toBe('300.00');
      expect(plan.cardObligations).toBe('300.00');
      expect(await planOf(owner, month)).toEqual(plan);
      expect(dashboard.investments).not.toHaveProperty(
        'suggestedAdditionalTotal',
      );
    });

    it('reports a shortfall when the mandatory does not fit', async () => {
      const owner = await wallet('500.00');

      await contribution(owner);

      expect(await planOf(owner)).toMatchObject({
        distributable: '300.00',
        shortfall: '400.00',
        suggestedAdditional: '0.00',
        canAcceptAdditional: true,
      });
    });

    it('flags overdue occurrences and counts them for the month', async () => {
      const owner = await wallet();
      const start = addMonthsToDate(today, -1);

      await contribution(owner, { startDate: start });

      const plan = await planOf(owner);

      expect(plan.mandatory.planned).toBe('1400.00');
      expect(plan.mandatory.plannedOccurrences).toEqual([
        expect.objectContaining({ date: start, overdue: true }),
        expect.objectContaining({ overdue: false }),
      ]);
      expect(plan.balanceBeforeContribution).toBe('1500.00');
      expect(plan.suggestedAdditional).toBe('0.00');
    });

    it('computes a past month without suggesting and a future month with the projection', async () => {
      const owner = await wallet();

      await contribution(owner, { startDate: addMonthsToDate(today, -2) });

      const past = await planOf(owner, lastMonth);

      expect(past).toMatchObject({
        suggestedAdditional: '0.00',
        canAcceptAdditional: false,
      });

      const future = await planOf(owner, nextMonth);

      expect(future.canAcceptAdditional).toBe(true);
      expect(future.month).toBe(firstDayOf(nextMonth));
      expect(future.mandatory.planned).toBe('2800.00');
    });

    it('never suggests on a NONE strategy, and never touches a dashboard balance', async () => {
      const owner = await wallet();

      const recurrence = await contribution(owner, {
        savingStrategy: {
          minimumRetainedBalance: '0.00',
          additionalContribution: 'NONE',
        },
      });

      const dashboard = await dashboardOf(owner);

      expect(dashboard.balances.projected).toBe('800.00');
      expect(dashboard.investments.savingPlans[0]).toMatchObject({
        additionalContribution: 'NONE',
        suggestedAdditional: '0.00',
        canAcceptAdditional: false,
      });

      await accept(owner, recurrence.uuid, {}).expect(409);
    });

    it('overlaps suggestions on a shared account until one of them is accepted', async () => {
      const owner = await wallet();

      const pension = uuidOf(
        await owner.agent
          .post('/api/investments')
          .send({ name: 'Pension', type: 'RESERVE' })
          .expect(201),
      );

      const reserve = await contribution(owner, { amount: '100.00' });

      const other = await contribution(owner, {
        amount: '100.00',
        investmentUuid: pension,
      });

      const suggestionOf = async (recurrence: string): Promise<string> => {
        const plans = await plansOf(owner);

        expect(plans).toHaveLength(2);

        return (
          plans.find((plan) => plan.recurrence.uuid === recurrence)
            ?.suggestedAdditional ?? ''
        );
      };

      await expect(suggestionOf(reserve.uuid)).resolves.toBe('1100.00');
      await expect(suggestionOf(other.uuid)).resolves.toBe('1100.00');

      await accept(owner, reserve.uuid, { amount: '500.00' }).expect(201);

      await expect(suggestionOf(reserve.uuid)).resolves.toBe('0.00');
      await expect(suggestionOf(other.uuid)).resolves.toBe('600.00');

      await expect(balanceOf(owner)).resolves.toBe('1500.00');
    });

    it('lists a plan only for months inside the recurrence dates', async () => {
      const owner = await wallet();

      await contribution(owner, {
        startDate: firstDayOf(nextMonth),
        endDate: lastDayOf(nextMonth),
      });

      await expect(plansOf(owner, thisMonth)).resolves.toEqual([]);
      await expect(plansOf(owner, shiftMonth(nextMonth, 1))).resolves.toEqual(
        [],
      );
      await expect(plansOf(owner, nextMonth)).resolves.toHaveLength(1);

      const dashboard = await dashboardOf(owner, thisMonth);

      expect(dashboard.investments.savingPlans).toEqual([]);
    });

    it('lists nothing for a recurrence without a strategy', async () => {
      const owner = await wallet();

      await contribution(owner, { savingStrategy: null });

      const plans = await owner.agent
        .get(`/api/recurrences/saving-plans?${query(thisMonth)}`)
        .expect(200);

      expect(dataOf<unknown[]>(plans)).toEqual([]);
    });

    it('requires year and month', async () => {
      const owner = await wallet();

      await owner.agent.get('/api/recurrences/saving-plans').expect(400);
    });
  });

  describe('additional contributions', () => {
    it('accepts an override as completed, moving the money and keeping the snapshot', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);

      const additional = dataOf<Movement>(
        await accept(owner, recurrence.uuid, {
          amount: '250.00',
          state: 'COMPLETED',
        }).expect(201),
      );

      expect(additional).toMatchObject({
        state: 'COMPLETED',
        amount: '250.00',
        completedOn: today,
        suggestedAmount: '600.00',
        retainedMinimum: '200.00',
      });

      await expect(balanceOf(owner)).resolves.toBe('1250.00');
      await expect(valueOf(owner)).resolves.toBe('250.00');

      const dashboard = await dashboardOf(owner);

      expect(dashboard.investments.contributionBreakdown).toMatchObject({
        additionalCompleted: '250.00',
        mandatoryPlanned: '700.00',
      });
      expect(dashboard.income.total).toBe('0.00');
      expect(dashboard.expenses.total).toBe('0.00');
    });

    it('keeps the snapshot after the strategy changes', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);

      const additional = dataOf<Movement>(
        await accept(owner, recurrence.uuid, {}).expect(201),
      );

      await owner.agent
        .patch(`/api/recurrences/${recurrence.uuid}`)
        .send({
          scope: 'ALL',
          amount: '10.00',
          savingStrategy: {
            minimumRetainedBalance: '999.00',
            additionalContribution: 'REMAINING_SURPLUS',
          },
        })
        .expect(200);

      const [stored] = (await movementsOf(owner)).filter(
        (movement) => movement.uuid === additional.uuid,
      );

      expect(stored).toMatchObject({
        amount: '600.00',
        suggestedAmount: '600.00',
        retainedMinimum: '200.00',
      });
    });

    it('allows one live contribution per month, and canceling frees the month', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);

      const first = dataOf<Movement>(
        await accept(owner, recurrence.uuid, {}).expect(201),
      );

      await accept(owner, recurrence.uuid, {}).expect(409);

      await owner.agent
        .put(`/api/investments/${owner.reserve}/movements/${first.uuid}/state`)
        .send({ state: 'CANCELED' })
        .expect(200);

      const plan = await planOf(owner);

      expect(plan).toMatchObject({
        additional: null,
        canAcceptAdditional: true,
      });

      const second = dataOf<Movement>(
        await accept(owner, recurrence.uuid, {}).expect(201),
      );

      expect(second.uuid).not.toBe(first.uuid);
    });

    it('accepts one and answers 409 to the other of two concurrent requests', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);

      const responses = await Promise.all([
        accept(owner, recurrence.uuid, {}),
        accept(owner, recurrence.uuid, {}),
        accept(owner, recurrence.uuid, {}),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409, 409,
      ]);

      const additional = (await movementsOf(owner)).filter(
        (movement) => movement.contributionKind === 'ADDITIONAL',
      );

      expect(additional).toHaveLength(1);
    });

    it('rejects closed months, dates outside the month, and dates before the opening', async () => {
      const owner = await wallet();

      const recurrence = await contribution(owner, {
        startDate: addMonthsToDate(today, -2),
      });

      await accept(owner, recurrence.uuid, {
        year: lastMonth.year,
        month: lastMonth.month,
      }).expect(422);

      await accept(owner, recurrence.uuid, {
        date: firstDayOf(nextMonth),
      }).expect(422);

      const younger = await wallet();

      await younger.agent
        .patch(`/api/accounts/${younger.bank}`)
        .send({ openingBalanceDate: today })
        .expect(200);

      const youngRecurrence = await contribution(younger);

      if (firstDayOf(thisMonth) < today) {
        await accept(younger, youngRecurrence.uuid, {
          date: firstDayOf(thisMonth),
        }).expect(422);
      }
    });

    it('defaults the date to today this month and to the first day of a later one', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);

      const current = dataOf<Movement>(
        await accept(owner, recurrence.uuid, {}).expect(201),
      );

      expect(current.date).toBe(today);

      const future = dataOf<Movement>(
        await accept(owner, recurrence.uuid, {
          year: nextMonth.year,
          month: nextMonth.month,
        }).expect(201),
      );

      expect(future.date).toBe(firstDayOf(nextMonth));
      expect(future.surplusMonth).toBe(firstDayOf(nextMonth));
      expect(future.date <= lastDayOf(nextMonth)).toBe(true);
    });

    it('rejects a completed contribution dated after today, while a planned one is allowed', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);

      const laterMonth = {
        year: nextMonth.year,
        month: nextMonth.month,
      };

      const { body } = (await accept(owner, recurrence.uuid, {
        ...laterMonth,
        state: 'COMPLETED',
      })
        .set('Accept-Language', 'en')
        .expect(422)) as { body: { message: string } };

      expect(body.message).toBe(
        'A completed contribution cannot be dated in the future. Record it as planned instead',
      );

      await accept(owner, recurrence.uuid, {
        ...laterMonth,
        date: lastDayOf(nextMonth),
        state: 'COMPLETED',
      }).expect(422);

      await expect(balanceOf(owner)).resolves.toBe('1500.00');
      await expect(valueOf(owner)).resolves.toBe('0.00');

      await accept(owner, recurrence.uuid, {
        ...laterMonth,
        state: 'PLANNED',
      }).expect(201);

      await expect(balanceOf(owner)).resolves.toBe('1500.00');
    });

    it('answers 409 for months outside the recurrence dates', async () => {
      const owner = await wallet();

      const recurrence = await contribution(owner, {
        startDate: today,
        endDate: lastDayOf(nextMonth),
      });

      await accept(owner, recurrence.uuid, {
        year: lastMonth.year,
        month: lastMonth.month,
      }).expect(409);

      const after = shiftMonth(nextMonth, 1);

      await accept(owner, recurrence.uuid, {
        year: after.year,
        month: after.month,
      }).expect(409);

      await accept(owner, recurrence.uuid, {
        year: nextMonth.year,
        month: nextMonth.month,
      }).expect(201);

      const upcoming = await contribution(owner, {
        startDate: firstDayOf(nextMonth),
      });

      await accept(owner, upcoming.uuid, {}).expect(409);
    });

    it('needs an active recurrence with the surplus strategy', async () => {
      const owner = await wallet();
      const paused = await contribution(owner);

      await owner.agent
        .put(`/api/recurrences/${paused.uuid}/state`)
        .send({ state: 'PAUSED' })
        .expect(200);

      await accept(owner, paused.uuid, {}).expect(409);

      const category = uuidOf(
        await owner.agent
          .post('/api/transaction-categories')
          .send({ name: 'Rent', kind: 'EXPENSE' })
          .expect(201),
      );

      const rent = uuidOf(
        await owner.agent
          .post('/api/recurrences')
          .send({
            type: 'EXPENSE',
            description: 'Rent',
            amount: '10.00',
            frequency: 'MONTHLY',
            startDate: today,
            accountUuid: owner.bank,
            categoryUuid: category,
          })
          .expect(201),
      );

      await accept(owner, rent, {}).expect(409);
    });

    it('rejects an invalid body before anything happens', async () => {
      const owner = await wallet();
      const recurrence = await contribution(owner);

      await accept(owner, recurrence.uuid, { amount: '0.00' }).expect(400);
      await accept(owner, recurrence.uuid, { state: 'CANCELED' }).expect(400);
      await accept(owner, recurrence.uuid, { month: 13 }).expect(400);
    });
  });
});
