import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { GenerateDueRecurrenceOccurrencesUseCase } from '@modules/recurrences/application/use-cases/generate-due-recurrence-occurrences.use-case';
import {
  addDaysToDate,
  addMonthsToDate,
  dayOfMonth,
  financeToday,
  firstDayOf,
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

interface EnvelopeBody<T> {
  data: T;
  meta?: { total: number };
}

interface RecurrenceShape {
  uuid: string;
  state: string;
  stateLabel: string;
  frequencyLabel: string;
  amount: string;
  endDate: string | null;
  nextOccurrenceDate: string | null;
  account: { uuid: string } | null;
  creditCard: { uuid: string } | null;
}

interface OccurrenceShape {
  uuid: string;
  occurrenceDate: string;
  date: string;
  amount: string;
  state: string;
  completedOn: string | null;
  transactionUuid: string | null;
  purchaseUuid: string | null;
  invoiceMonth: string | null;
}

interface TransactionShape {
  uuid: string;
  state: string;
  recurrence: { uuid: string; occurrenceDate: string } | null;
}

interface DashboardShape {
  balances: { available: string };
  expenses: { pending: string };
  creditCards: { planned: string; spending: string };
}

function dataOf<T>(body: unknown): T {
  return (body as EnvelopeBody<T>).data;
}

function totalOf(body: unknown): number {
  return (body as EnvelopeBody<unknown>).meta?.total ?? 0;
}

// Generation runs up to 12 months after the current month, so every date here
// is derived from today in America/Sao_Paulo instead of being fixed.
describe('Recurrences (e2e)', () => {
  let app: INestApplication<App>;
  let owner: AuthAgent;
  let admin: AuthAgent;
  let wallet: {
    bank: string;
    rent: string;
    subscriptions: string;
    card: string;
  };

  const today = financeToday();
  const thisMonth = monthOf(today);
  const horizonMonths = 12;

  beforeAll(async () => {
    app = await createTestApp();
    owner = await createAuthAgent(app, await createIsolatedUser(app));
    admin = await createAuthAgent(app, ADMIN_CREDENTIALS);

    const bank = await owner
      .post('/api/accounts')
      .send({
        name: 'Bank',
        type: 'CHECKING',
        openingBalance: '5000.00',
        openingBalanceDate: '2025-01-01',
      })
      .expect(201);

    const rent = await owner
      .post('/api/transaction-categories')
      .send({ name: 'Rent', kind: 'EXPENSE' })
      .expect(201);

    const subscriptions = await owner
      .post('/api/transaction-categories')
      .send({ name: 'Streaming', kind: 'EXPENSE' })
      .expect(201);

    const card = await owner
      .post('/api/credit-cards')
      .send({ name: 'Visa', creditLimit: '5000.00', closingDay: 5, dueDay: 12 })
      .expect(201);

    wallet = {
      bank: dataOf<{ uuid: string }>(bank.body).uuid,
      rent: dataOf<{ uuid: string }>(rent.body).uuid,
      subscriptions: dataOf<{ uuid: string }>(subscriptions.body).uuid,
      card: dataOf<{ uuid: string }>(card.body).uuid,
    };
  });

  afterAll(async () => {
    await app.close();
  });

  async function createRecurrence(
    body: Record<string, unknown>,
  ): Promise<RecurrenceShape> {
    const response = await owner
      .post('/api/recurrences')
      .send({
        type: 'EXPENSE',
        description: 'Rent',
        amount: '1500.00',
        frequency: 'MONTHLY',
        startDate: today,
        accountUuid: wallet.bank,
        categoryUuid: wallet.rent,
        ...body,
      })
      .expect(201);

    return dataOf<RecurrenceShape>(response.body);
  }

  async function occurrencesOf(uuid: string): Promise<OccurrenceShape[]> {
    const response = await owner
      .get(`/api/recurrences/${uuid}/occurrences?limit=50`)
      .expect(200);

    return dataOf<OccurrenceShape[]>(response.body);
  }

  async function balance(): Promise<string> {
    const response = await owner
      .get(`/api/accounts/${wallet.bank}`)
      .expect(200);

    return dataOf<{ currentBalance: string }>(response.body).currentBalance;
  }

  it('generates planned transactions without touching the balance and confirms each one exactly once', async () => {
    const before = await balance();
    const recurrence = await createRecurrence({});

    expect(recurrence).toMatchObject({
      state: 'ACTIVE',
      nextOccurrenceDate: today,
      account: { uuid: wallet.bank },
      creditCard: null,
    });

    const occurrences = await occurrencesOf(recurrence.uuid);

    expect(occurrences).toHaveLength(horizonMonths + 1);
    expect(new Set(occurrences.map((o) => o.occurrenceDate)).size).toBe(
      occurrences.length,
    );
    expect(occurrences.every((o) => o.state === 'PLANNED')).toBe(true);
    expect(occurrences[1].occurrenceDate).toBe(addMonthsToDate(today, 1));
    expect(await balance()).toBe(before);

    const listed = await owner
      .get(`/api/transactions?recurrenceUuid=${recurrence.uuid}&limit=50`)
      .expect(200);

    expect(totalOf(listed.body)).toBe(occurrences.length);
    expect(dataOf<TransactionShape[]>(listed.body)[0].recurrence?.uuid).toBe(
      recurrence.uuid,
    );

    const first = occurrences[0];

    const confirmed = await owner
      .put(
        `/api/recurrences/${recurrence.uuid}/occurrences/${first.uuid}/confirmation`,
      )
      .send({ amount: '1520.00', date: today })
      .expect(200);

    expect(dataOf<OccurrenceShape>(confirmed.body)).toMatchObject({
      state: 'COMPLETED',
      amount: '1520.00',
      completedOn: today,
      transactionUuid: first.uuid,
    });
    expect(Number(await balance())).toBeCloseTo(Number(before) - 1520, 2);

    await owner
      .put(
        `/api/recurrences/${recurrence.uuid}/occurrences/${first.uuid}/confirmation`,
      )
      .send({})
      .expect(409);
    expect(Number(await balance())).toBeCloseTo(Number(before) - 1520, 2);
  });

  it('updates future planned occurrences only and ends from a date without rewriting history', async () => {
    const recurrence = await createRecurrence({ description: 'Gym' });
    const [first, second] = await occurrencesOf(recurrence.uuid);

    await owner
      .put(
        `/api/recurrences/${recurrence.uuid}/occurrences/${first.uuid}/confirmation`,
      )
      .send({})
      .expect(200);

    await owner
      .patch(`/api/recurrences/${recurrence.uuid}`)
      .send({
        scope: 'FUTURE',
        from: second.occurrenceDate,
        amount: '1600.00',
      })
      .expect(200);

    const updated = await occurrencesOf(recurrence.uuid);

    expect(updated[0]).toMatchObject({ state: 'COMPLETED', amount: '1500.00' });
    expect(updated.slice(1).every((o) => o.amount === '1600.00')).toBe(true);

    const cut = addMonthsToDate(today, 3);

    const ended = await owner
      .put(`/api/recurrences/${recurrence.uuid}/end`)
      .send({ from: cut })
      .expect(200);

    expect(dataOf<RecurrenceShape>(ended.body).endDate).toBe(
      addDaysToDate(cut, -1),
    );

    const remaining = await occurrencesOf(recurrence.uuid);

    expect(remaining.map((o) => o.occurrenceDate)).toEqual([
      today,
      addMonthsToDate(today, 1),
      addMonthsToDate(today, 2),
    ]);
    expect(remaining[0].state).toBe('COMPLETED');
  });

  it('pauses and resumes without duplicating an occurrence date', async () => {
    const recurrence = await createRecurrence({
      description: 'Insurance',
      startDate: addDaysToDate(today, 1),
    });

    const paused = await owner
      .put(`/api/recurrences/${recurrence.uuid}/state`)
      .send({ state: 'PAUSED' })
      .expect(200);

    expect(dataOf<RecurrenceShape>(paused.body)).toMatchObject({
      state: 'PAUSED',
      nextOccurrenceDate: null,
    });
    expect(await occurrencesOf(recurrence.uuid)).toHaveLength(0);

    await owner
      .put(`/api/recurrences/${recurrence.uuid}/state`)
      .send({ state: 'PAUSED' })
      .expect(409);

    await owner
      .put(`/api/recurrences/${recurrence.uuid}/state`)
      .send({ state: 'ACTIVE' })
      .expect(200);

    const resumed = await occurrencesOf(recurrence.uuid);

    expect(resumed.length).toBeGreaterThan(0);
    expect(resumed[0].occurrenceDate).toBe(addDaysToDate(today, 1));
    expect(new Set(resumed.map((o) => o.occurrenceDate)).size).toBe(
      resumed.length,
    );
  });

  it('ends a card subscription from an invoice month, keeping the earlier charges and invoices', async () => {
    const start = dayOfMonth(thisMonth, 15);

    const netflix = await createRecurrence({
      description: 'Netflix',
      amount: '55.90',
      startDate: start,
      accountUuid: undefined,
      creditCardUuid: wallet.card,
      categoryUuid: wallet.subscriptions,
    });

    const charges = await occurrencesOf(netflix.uuid);
    const firstInvoice = firstDayOf(shiftMonth(thisMonth, 1));

    expect(charges[0]).toMatchObject({
      occurrenceDate: start,
      state: 'PLANNED',
      invoiceMonth: firstInvoice,
      purchaseUuid: null,
    });

    const plannedDashboard = await owner
      .get(
        `/api/dashboard?year=${shiftMonth(thisMonth, 2).year}&month=${shiftMonth(thisMonth, 2).month}&perspective=INVOICE_MONTH`,
      )
      .expect(200);

    expect(
      dataOf<DashboardShape>(plannedDashboard.body).creditCards.planned,
    ).toBe('55.90');

    const confirmed = await owner
      .put(
        `/api/recurrences/${netflix.uuid}/occurrences/${charges[0].uuid}/confirmation`,
      )
      .send({})
      .expect(200);

    const purchaseUuid = dataOf<OccurrenceShape>(confirmed.body).purchaseUuid;

    expect(purchaseUuid).not.toBeNull();

    const purchase = await owner
      .get(`/api/credit-card-purchases/${purchaseUuid}`)
      .expect(200);

    expect(
      dataOf<{ installments: Array<{ invoice: { referenceMonth: string } }> }>(
        purchase.body,
      ).installments[0].invoice.referenceMonth,
    ).toBe(firstInvoice);

    const cutMonth = firstDayOf(shiftMonth(thisMonth, 3));

    await owner
      .put(`/api/recurrences/${netflix.uuid}/end`)
      .send({ fromInvoiceMonth: cutMonth })
      .expect(200);

    const remaining = await occurrencesOf(netflix.uuid);

    expect(remaining.map((o) => [o.invoiceMonth, o.state])).toEqual([
      [firstInvoice, 'COMPLETED'],
      [firstDayOf(shiftMonth(thisMonth, 2)), 'PLANNED'],
    ]);
    expect(remaining.every((o) => o.invoiceMonth! < cutMonth)).toBe(true);

    await owner.get(`/api/credit-card-purchases/${purchaseUuid}`).expect(200);

    await owner
      .put(`/api/recurrences/${netflix.uuid}/end`)
      .send({ fromInvoiceMonth: cutMonth, from: today })
      .expect(400);
  });

  it('skips one card charge and edits another without changing the recurrence', async () => {
    const recurrence = await createRecurrence({
      description: 'Music',
      amount: '21.90',
      startDate: addDaysToDate(today, 1),
      accountUuid: undefined,
      creditCardUuid: wallet.card,
      categoryUuid: wallet.subscriptions,
    });

    const [first, second] = await occurrencesOf(recurrence.uuid);

    await owner
      .put(
        `/api/recurrences/${recurrence.uuid}/occurrences/${first.uuid}/cancellation`,
      )
      .expect(200);

    const edited = await owner
      .patch(`/api/recurrences/${recurrence.uuid}/occurrences/${second.uuid}`)
      .send({ amount: '24.90' })
      .expect(200);

    expect(dataOf<OccurrenceShape>(edited.body)).toMatchObject({
      amount: '24.90',
      state: 'PLANNED',
    });

    const after = await occurrencesOf(recurrence.uuid);

    expect(after[0].state).toBe('CANCELED');
    expect(after[2].amount).toBe('21.90');

    await owner
      .put(
        `/api/recurrences/${recurrence.uuid}/occurrences/${first.uuid}/confirmation`,
      )
      .send({})
      .expect(409);
  });

  it('validates targets and invoice-month ends', async () => {
    await owner
      .post('/api/recurrences')
      .send({
        type: 'INCOME',
        description: 'Salary',
        amount: '8000.00',
        frequency: 'MONTHLY',
        startDate: today,
        creditCardUuid: wallet.card,
        categoryUuid: wallet.rent,
      })
      .expect(400);

    await owner
      .post('/api/recurrences')
      .send({
        type: 'INCOME',
        description: 'Salary',
        amount: '8000.00',
        frequency: 'MONTHLY',
        startDate: today,
        accountUuid: wallet.bank,
        categoryUuid: wallet.rent,
      })
      .expect(422);

    const recurrence = await createRecurrence({ description: 'Water' });

    await owner
      .put(`/api/recurrences/${recurrence.uuid}/end`)
      .send({ fromInvoiceMonth: firstDayOf(shiftMonth(thisMonth, 1)) })
      .expect(422);

    const ended = await owner
      .put(`/api/recurrences/${recurrence.uuid}/end`)
      .send({})
      .expect(200);

    expect(dataOf<RecurrenceShape>(ended.body)).toMatchObject({
      state: 'ENDED',
      endDate: today,
    });
    expect(
      (await occurrencesOf(recurrence.uuid)).map((o) => o.occurrenceDate),
    ).toEqual([today]);

    await owner
      .patch(`/api/recurrences/${recurrence.uuid}`)
      .send({ scope: 'ALL', amount: '10.00' })
      .expect(409);
  });

  describe.each([
    [
      'account transactions',
      () => ({ accountUuid: wallet.bank, categoryUuid: wallet.rent }),
    ],
    [
      'card charges',
      () => ({
        accountUuid: undefined,
        creditCardUuid: wallet.card,
        categoryUuid: wallet.subscriptions,
      }),
    ],
  ])('an ended recurrence of %s', (kind, target) => {
    const yesterday = addDaysToDate(today, -1);
    const threeMonthsAgo = addMonthsToDate(today, -3);

    async function endedToday(description: string) {
      const created = await createRecurrence({
        description: `${kind} ${description}`,
        startDate: threeMonthsAgo,
        ...target(),
      });

      const ended = await owner
        .put(`/api/recurrences/${created.uuid}/end`)
        .send({ from: today })
        .expect(200);

      return dataOf<RecurrenceShape>(ended.body);
    }

    function occurrencePath(recurrence: string, occurrence: string) {
      return `/api/recurrences/${recurrence}/occurrences/${occurrence}`;
    }

    it('keeps only the planned occurrences up to its end date', async () => {
      const ended = await endedToday('kept');

      expect(ended).toMatchObject({
        state: 'ENDED',
        endDate: yesterday,
        nextOccurrenceDate: null,
      });

      const kept = await occurrencesOf(ended.uuid);

      expect(kept.length).toBeGreaterThanOrEqual(3);
      expect(kept.every((o) => o.occurrenceDate <= yesterday)).toBe(true);
      expect(kept.every((o) => o.state === 'PLANNED')).toBe(true);
    });

    it('freezes the template and cannot be reactivated', async () => {
      const ended = await endedToday('frozen');

      await owner
        .patch(`/api/recurrences/${ended.uuid}`)
        .send({ scope: 'ALL', amount: '10.00' })
        .expect(409);

      for (const state of ['ACTIVE', 'PAUSED']) {
        await owner
          .put(`/api/recurrences/${ended.uuid}/state`)
          .send({ state })
          .expect(409);
      }

      await owner
        .put(`/api/recurrences/${ended.uuid}/end`)
        .send({})
        .expect(409);

      const reread = await owner
        .get(`/api/recurrences/${ended.uuid}`)
        .expect(200);

      expect(dataOf<RecurrenceShape>(reread.body)).toMatchObject({
        state: 'ENDED',
        amount: ended.amount,
        endDate: yesterday,
      });
    });

    it('edits, confirms, and cancels planned occurrences, leaving the template and history alone', async () => {
      const ended = await endedToday('managed');
      const [toConfirm, toCancel, toEdit] = await occurrencesOf(ended.uuid);

      const edited = await owner
        .patch(occurrencePath(ended.uuid, toEdit.uuid))
        .send({ amount: '42.00', date: toEdit.occurrenceDate })
        .expect(200);

      expect(dataOf<OccurrenceShape>(edited.body)).toMatchObject({
        amount: '42.00',
        state: 'PLANNED',
      });

      const confirmed = await owner
        .put(`${occurrencePath(ended.uuid, toConfirm.uuid)}/confirmation`)
        .send({ amount: '41.00', date: toConfirm.occurrenceDate })
        .expect(200);

      expect(dataOf<OccurrenceShape>(confirmed.body)).toMatchObject({
        amount: '41.00',
        state: 'COMPLETED',
      });

      const canceled = await owner
        .put(`${occurrencePath(ended.uuid, toCancel.uuid)}/cancellation`)
        .expect(200);

      expect(dataOf<OccurrenceShape>(canceled.body).state).toBe('CANCELED');

      const reread = await owner
        .get(`/api/recurrences/${ended.uuid}`)
        .expect(200);

      expect(dataOf<RecurrenceShape>(reread.body)).toMatchObject({
        state: 'ENDED',
        amount: ended.amount,
        endDate: yesterday,
      });

      for (const finished of [toConfirm, toCancel]) {
        const path = occurrencePath(ended.uuid, finished.uuid);

        await owner.patch(path).send({ amount: '1.00' }).expect(409);
        await owner.put(`${path}/confirmation`).send({}).expect(409);
        await owner.put(`${path}/cancellation`).expect(409);
      }

      const before = await occurrencesOf(ended.uuid);

      await app.get(GenerateDueRecurrenceOccurrencesUseCase).execute();

      const after = await occurrencesOf(ended.uuid);

      expect(after).toEqual(before);
      expect(after.find(({ uuid }) => uuid === toConfirm.uuid)).toMatchObject({
        state: 'COMPLETED',
        amount: '41.00',
      });
      expect(after.find(({ uuid }) => uuid === toCancel.uuid)?.state).toBe(
        'CANCELED',
      );
      expect(after.find(({ uuid }) => uuid === toEdit.uuid)).toMatchObject({
        state: 'PLANNED',
        amount: '42.00',
      });
    });

    it('keeps planned occurrences up to today and the history when ended as a whole', async () => {
      const created = await createRecurrence({
        description: `${kind} ended as a whole`,
        startDate: threeMonthsAgo,
        ...target(),
      });

      const [toConfirm, toCancel] = await occurrencesOf(created.uuid);

      await owner
        .put(`${occurrencePath(created.uuid, toConfirm.uuid)}/confirmation`)
        .send({ date: toConfirm.occurrenceDate })
        .expect(200);

      await owner
        .put(`${occurrencePath(created.uuid, toCancel.uuid)}/cancellation`)
        .expect(200);

      const ended = await owner
        .put(`/api/recurrences/${created.uuid}/end`)
        .send({})
        .expect(200);

      expect(dataOf<RecurrenceShape>(ended.body)).toMatchObject({
        state: 'ENDED',
        endDate: today,
        nextOccurrenceDate: null,
      });

      const kept = await occurrencesOf(created.uuid);

      expect(kept.every((o) => o.occurrenceDate <= today)).toBe(true);
      expect(kept[0]).toMatchObject({
        uuid: toConfirm.uuid,
        state: 'COMPLETED',
      });
      expect(kept[1]).toMatchObject({ uuid: toCancel.uuid, state: 'CANCELED' });

      const planned = kept.filter((o) => o.state === 'PLANNED');

      expect(planned.length).toBeGreaterThanOrEqual(1);

      await owner
        .patch(occurrencePath(created.uuid, planned[0].uuid))
        .send({ date: addDaysToDate(today, 1) })
        .expect(422);

      await owner
        .put(`${occurrencePath(created.uuid, planned[0].uuid)}/confirmation`)
        .send({})
        .expect(200);
    });

    it('removes every planned occurrence with a cut on the start date, keeping the history', async () => {
      const created = await createRecurrence({
        description: `${kind} cut at the start`,
        startDate: threeMonthsAgo,
        ...target(),
      });

      const [toConfirm, toCancel] = await occurrencesOf(created.uuid);

      await owner
        .put(`${occurrencePath(created.uuid, toConfirm.uuid)}/confirmation`)
        .send({ date: toConfirm.occurrenceDate })
        .expect(200);

      await owner
        .put(`${occurrencePath(created.uuid, toCancel.uuid)}/cancellation`)
        .expect(200);

      const ended = await owner
        .put(`/api/recurrences/${created.uuid}/end`)
        .send({ from: threeMonthsAgo })
        .expect(200);

      expect(dataOf<RecurrenceShape>(ended.body).state).toBe('ENDED');
      expect(
        (await occurrencesOf(created.uuid)).map(({ uuid, state }) => [
          uuid,
          state,
        ]),
      ).toEqual([
        [toConfirm.uuid, 'COMPLETED'],
        [toCancel.uuid, 'CANCELED'],
      ]);
    });

    it('refuses to reschedule past the end date and never changes the scheduled date', async () => {
      const ended = await endedToday('rescheduled');
      const [occurrence] = await occurrencesOf(ended.uuid);
      const path = occurrencePath(ended.uuid, occurrence.uuid);

      await owner.patch(path).send({ date: today }).expect(422);

      const moved = await owner
        .patch(path)
        .send({ date: yesterday })
        .expect(200);

      expect(dataOf<OccurrenceShape>(moved.body)).toMatchObject({
        occurrenceDate: occurrence.occurrenceDate,
        date: yesterday,
        state: 'PLANNED',
      });
    });

    it('confirms an old occurrence on a date after the end date', async () => {
      const ended = await endedToday('confirmed late');
      const [occurrence] = await occurrencesOf(ended.uuid);

      const confirmed = await owner
        .put(`${occurrencePath(ended.uuid, occurrence.uuid)}/confirmation`)
        .send({ date: today })
        .expect(200);

      expect(dataOf<OccurrenceShape>(confirmed.body)).toMatchObject({
        occurrenceDate: occurrence.occurrenceDate,
        state: 'COMPLETED',
        completedOn: today,
      });
    });

    it('applies the end date before the recurrence has ended too', async () => {
      const endDate = addMonthsToDate(today, 2);

      const recurrence = await createRecurrence({
        description: `${kind} ending soon`,
        startDate: today,
        endDate,
        ...target(),
      });

      expect(recurrence.state).toBe('ACTIVE');

      const [occurrence] = await occurrencesOf(recurrence.uuid);
      const path = occurrencePath(recurrence.uuid, occurrence.uuid);

      await owner
        .patch(path)
        .send({ date: addDaysToDate(endDate, 1) })
        .expect(422);
      await owner.patch(path).send({ date: endDate }).expect(200);
    });

    it('generates nothing when created past its end date, not even from the daily job', async () => {
      const recurrence = await createRecurrence({
        description: `${kind} already over`,
        startDate: threeMonthsAgo,
        endDate: yesterday,
        ...target(),
      });

      expect(recurrence).toMatchObject({
        state: 'ENDED',
        nextOccurrenceDate: null,
      });
      expect(await occurrencesOf(recurrence.uuid)).toHaveLength(0);

      await app.get(GenerateDueRecurrenceOccurrencesUseCase).execute();

      expect(await occurrencesOf(recurrence.uuid)).toHaveLength(0);
    });
  });

  it('applies an invoice-month cutoff that already passed like any other end date', async () => {
    const cutMonth = firstDayOf(thisMonth);

    const created = await createRecurrence({
      description: 'Ended from an invoice',
      amount: '19.90',
      startDate: addMonthsToDate(today, -3),
      accountUuid: undefined,
      creditCardUuid: wallet.card,
      categoryUuid: wallet.subscriptions,
    });

    const [toConfirm] = await occurrencesOf(created.uuid);

    const confirmed = await owner
      .put(
        `/api/recurrences/${created.uuid}/occurrences/${toConfirm.uuid}/confirmation`,
      )
      .send({ date: toConfirm.occurrenceDate })
      .expect(200);

    const { purchaseUuid } = dataOf<OccurrenceShape>(confirmed.body);

    const ended = dataOf<RecurrenceShape>(
      (
        await owner
          .put(`/api/recurrences/${created.uuid}/end`)
          .send({ fromInvoiceMonth: cutMonth })
          .expect(200)
      ).body,
    );

    expect(ended.state).toBe('ENDED');

    const endDate = ended.endDate!;
    const kept = await occurrencesOf(created.uuid);

    expect(kept[0]).toMatchObject({ uuid: toConfirm.uuid, state: 'COMPLETED' });
    expect(kept.every((o) => o.occurrenceDate <= endDate)).toBe(true);
    expect(kept.every((o) => o.invoiceMonth! < cutMonth)).toBe(true);

    await owner.get(`/api/credit-card-purchases/${purchaseUuid}`).expect(200);

    const [, toMove] = kept;
    const path = `/api/recurrences/${created.uuid}/occurrences/${toMove.uuid}`;

    await owner
      .patch(path)
      .send({ date: addDaysToDate(endDate, 1) })
      .expect(422);

    const moved = await owner.patch(path).send({ date: endDate }).expect(200);

    expect(dataOf<OccurrenceShape>(moved.body).invoiceMonth! < cutMonth).toBe(
      true,
    );

    const late = await owner
      .put(`${path}/confirmation`)
      .send({ date: today })
      .expect(200);

    expect(dataOf<OccurrenceShape>(late.body)).toMatchObject({
      occurrenceDate: toMove.occurrenceDate,
      date: today,
      completedOn: today,
      state: 'COMPLETED',
    });
    expect(dataOf<OccurrenceShape>(late.body).invoiceMonth! >= cutMonth).toBe(
      true,
    );
  });

  it('refuses a transactions route that moves an occurrence past the end date', async () => {
    const created = await createRecurrence({
      description: 'Ended, moved through transactions',
      startDate: addMonthsToDate(today, -3),
    });

    await owner
      .put(`/api/recurrences/${created.uuid}/end`)
      .send({ from: today })
      .expect(200);

    const [occurrence] = await occurrencesOf(created.uuid);

    await owner
      .patch(`/api/transactions/${occurrence.uuid}`)
      .send({ date: today })
      .expect(422);

    const moved = await owner
      .patch(`/api/transactions/${occurrence.uuid}`)
      .send({ date: addDaysToDate(today, -1) })
      .expect(200);

    expect(dataOf<TransactionShape>(moved.body).recurrence).toMatchObject({
      occurrenceDate: occurrence.occurrenceDate,
    });

    const completed = await owner
      .put(`/api/transactions/${occurrence.uuid}/state`)
      .send({ state: 'COMPLETED', completedOn: today })
      .expect(200);

    expect(dataOf<TransactionShape>(completed.body).state).toBe('COMPLETED');
  });

  it('lets the transactions routes manage a planned occurrence of an ended recurrence', async () => {
    const created = await createRecurrence({
      description: 'Ended through transactions',
      startDate: addMonthsToDate(today, -3),
    });

    await owner
      .put(`/api/recurrences/${created.uuid}/end`)
      .send({ from: today })
      .expect(200);

    const [toEdit, toComplete] = await occurrencesOf(created.uuid);

    await owner
      .patch(`/api/transactions/${toEdit.uuid}`)
      .send({ amount: '77.00' })
      .expect(200);

    await owner
      .put(`/api/transactions/${toComplete.uuid}/state`)
      .send({ state: 'COMPLETED', completedOn: toComplete.occurrenceDate })
      .expect(200);

    const [edited, completed] = await occurrencesOf(created.uuid);

    expect(edited).toMatchObject({ amount: '77.00', state: 'PLANNED' });
    expect(completed.state).toBe('COMPLETED');
  });

  it("never exposes a user's recurrences to another user, even an admin", async () => {
    const recurrence = await createRecurrence({ description: 'Private' });
    const [occurrence] = await occurrencesOf(recurrence.uuid);

    await admin.get(`/api/recurrences/${recurrence.uuid}`).expect(404);
    await admin
      .get(`/api/recurrences/${recurrence.uuid}/occurrences`)
      .expect(404);
    await admin
      .patch(`/api/recurrences/${recurrence.uuid}`)
      .send({ scope: 'ALL', amount: '1.00' })
      .expect(404);
    await admin
      .put(
        `/api/recurrences/${recurrence.uuid}/occurrences/${occurrence.uuid}/confirmation`,
      )
      .send({})
      .expect(404);
    await admin
      .put(`/api/recurrences/${recurrence.uuid}/end`)
      .send({})
      .expect(404);

    const listed = await admin
      .get('/api/recurrences?description=Private')
      .expect(200);

    expect(
      dataOf<RecurrenceShape[]>(listed.body).map(({ uuid }) => uuid),
    ).not.toContain(recurrence.uuid);

    await admin
      .post('/api/recurrences')
      .send({
        type: 'EXPENSE',
        description: 'Borrowed',
        amount: '1.00',
        frequency: 'MONTHLY',
        startDate: today,
        accountUuid: wallet.bank,
        categoryUuid: wallet.rent,
      })
      .expect(404);

    await owner.get(`/api/recurrences/${recurrence.uuid}`).expect(200);
  });
});
