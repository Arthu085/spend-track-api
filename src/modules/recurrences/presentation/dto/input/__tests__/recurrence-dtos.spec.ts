import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRecurrenceDto } from '../create-recurrence.dto';
import { EndRecurrenceDto } from '../end-recurrence.dto';
import { ListRecurrencesQueryDto } from '../list-recurrences-query.dto';
import { RecurrenceOccurrenceScheduleDto } from '../recurrence-occurrence-schedule.dto';
import { UpdateRecurrenceStateDto } from '../update-recurrence-state.dto';
import { UpdateRecurrenceDto } from '../update-recurrence.dto';

const ACCOUNT = '3f2b7c1e-2a4d-4d8e-9a51-0c6f1b2d3e4f';
const CARD = '6a1d0b9c-8e7f-4a3b-9c2d-1e0f2a3b4c5d';
const CATEGORY = '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

async function failedFields(
  dto: new () => object,
  body: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(dto, body));

  return errors.map((error) => error.property).sort();
}

describe('CreateRecurrenceDto', () => {
  const rent = {
    type: 'EXPENSE',
    description: 'Rent',
    amount: '1500.00',
    frequency: 'MONTHLY',
    startDate: '2026-11-15',
    accountUuid: ACCOUNT,
    categoryUuid: CATEGORY,
  };

  const netflix = {
    ...rent,
    accountUuid: undefined,
    creditCardUuid: CARD,
  };

  it.each([
    ['an account recurrence', rent],
    [
      'a card recurrence with an end date',
      { ...netflix, endDate: '2027-11-15' },
    ],
    ['null notes and end date', { ...rent, notes: null, endDate: null }],
  ])('accepts %s', async (_, body) => {
    await expect(failedFields(CreateRecurrenceDto, body)).resolves.toEqual([]);
  });

  it.each([
    ['neither target', { ...rent, accountUuid: undefined }, ['accountUuid']],
    ['both targets', { ...rent, creditCardUuid: CARD }, ['accountUuid']],
    ['a card on an income', { ...netflix, type: 'INCOME' }, ['creditCardUuid']],
    ['an unknown frequency', { ...rent, frequency: 'DAILY' }, ['frequency']],
    ['a zero amount', { ...rent, amount: '0' }, ['amount']],
  ])('rejects %s', async (_, body, fields) => {
    await expect(failedFields(CreateRecurrenceDto, body)).resolves.toEqual(
      fields,
    );
  });
});

describe('UpdateRecurrenceDto', () => {
  it('accepts a FUTURE scope with a start date and partial fields', async () => {
    await expect(
      failedFields(UpdateRecurrenceDto, {
        scope: 'FUTURE',
        from: '2026-12-01',
        amount: '1600.00',
        notes: null,
      }),
    ).resolves.toEqual([]);
  });

  it('rejects a start date with the ALL scope and a missing scope', async () => {
    await expect(
      failedFields(UpdateRecurrenceDto, { scope: 'ALL', from: '2026-12-01' }),
    ).resolves.toEqual(['from']);
    await expect(failedFields(UpdateRecurrenceDto, {})).resolves.toEqual([
      'scope',
    ]);
  });
});

describe('EndRecurrenceDto', () => {
  it.each([
    [{}],
    [{ from: '2026-12-10' }],
    [{ fromInvoiceMonth: '2026-12-01' }],
    [{ from: null, fromInvoiceMonth: null }],
  ])('accepts %j', async (body) => {
    await expect(failedFields(EndRecurrenceDto, body)).resolves.toEqual([]);
  });

  it('rejects an invoice month that is not a first day or comes with a date', async () => {
    await expect(
      failedFields(EndRecurrenceDto, { fromInvoiceMonth: '2026-12-05' }),
    ).resolves.toEqual(['fromInvoiceMonth']);
    await expect(
      failedFields(EndRecurrenceDto, {
        from: '2026-12-10',
        fromInvoiceMonth: '2026-12-01',
      }),
    ).resolves.toEqual(['fromInvoiceMonth']);
  });
});

describe('other recurrence DTOs', () => {
  it('validates states, schedules, and list filters', async () => {
    await expect(
      failedFields(UpdateRecurrenceStateDto, { state: 'ENDED' }),
    ).resolves.toEqual(['state']);
    await expect(
      failedFields(RecurrenceOccurrenceScheduleDto, {
        amount: '10.00',
        date: '2026-11-16',
      }),
    ).resolves.toEqual([]);
    await expect(
      failedFields(RecurrenceOccurrenceScheduleDto, { date: '16/11/2026' }),
    ).resolves.toEqual(['date']);
    await expect(
      failedFields(ListRecurrencesQueryDto, {
        state: 'PAUSED',
        type: 'INCOME',
      }),
    ).resolves.toEqual([]);
  });
});
