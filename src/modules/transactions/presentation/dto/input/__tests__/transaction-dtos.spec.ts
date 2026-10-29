import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTransactionDto } from '../create-transaction.dto';
import { ListTransactionsQueryDto } from '../list-transactions-query.dto';
import { UpdateTransactionStateDto } from '../update-transaction-state.dto';
import { UpdateTransactionDto } from '../update-transaction.dto';

const ACCOUNT = '3f2b7c1e-2a4d-4d8e-9a51-0c6f1b2d3e4f';
const OTHER_ACCOUNT = '6a1d0b9c-8e7f-4a3b-9c2d-1e0f2a3b4c5d';
const CATEGORY = '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

async function failedFields(
  dto: new () => object,
  body: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(dto, body));

  return errors.map((error) => error.property).sort();
}

describe('CreateTransactionDto', () => {
  const expense = {
    type: 'EXPENSE',
    description: 'Market',
    amount: '250.40',
    date: '2026-10-29',
    state: 'PLANNED',
    accountUuid: ACCOUNT,
    categoryUuid: CATEGORY,
  };

  const transfer = {
    ...expense,
    type: 'TRANSFER',
    categoryUuid: undefined,
    destinationAccountUuid: OTHER_ACCOUNT,
  };

  it.each([
    ['an expense', expense],
    ['a transfer', transfer],
    [
      'a completed income with an effective date and notes',
      {
        ...expense,
        type: 'INCOME',
        state: 'COMPLETED',
        completedOn: '2026-10-30',
        notes: null,
      },
    ],
  ])('accepts %s', async (_, body) => {
    await expect(failedFields(CreateTransactionDto, body)).resolves.toEqual([]);
  });

  it.each([
    ['a zero amount', { ...expense, amount: '0.00' }, ['amount']],
    ['a negative amount', { ...expense, amount: '-1.00' }, ['amount']],
    ['three decimal places', { ...expense, amount: '1.005' }, ['amount']],
    ['a canceled state', { ...expense, state: 'CANCELED' }, ['state']],
    [
      'an effective date on a planned transaction',
      { ...expense, completedOn: '2026-10-29' },
      ['completedOn'],
    ],
    [
      'an expense without a category',
      { ...expense, categoryUuid: undefined },
      ['categoryUuid'],
    ],
    [
      'an expense with a destination account',
      { ...expense, destinationAccountUuid: OTHER_ACCOUNT },
      ['destinationAccountUuid'],
    ],
    [
      'a transfer without a destination',
      { ...transfer, destinationAccountUuid: undefined },
      ['destinationAccountUuid'],
    ],
    [
      'a transfer with a category',
      { ...transfer, categoryUuid: CATEGORY },
      ['categoryUuid'],
    ],
    ['a blank description', { ...expense, description: '  ' }, ['description']],
    [
      'notes over 1000 characters',
      { ...expense, notes: 'x'.repeat(1001) },
      ['notes'],
    ],
  ])('rejects %s', async (_, body, fields) => {
    await expect(failedFields(CreateTransactionDto, body)).resolves.toEqual(
      fields,
    );
  });
});

describe('UpdateTransactionDto', () => {
  it('accepts an empty body and null notes', async () => {
    await expect(
      failedFields(UpdateTransactionDto, { notes: null }),
    ).resolves.toEqual([]);
  });

  it('rejects a zero amount and a malformed account', async () => {
    await expect(
      failedFields(UpdateTransactionDto, { amount: '0', accountUuid: 'x' }),
    ).resolves.toEqual(['accountUuid', 'amount']);
  });
});

describe('UpdateTransactionStateDto', () => {
  it('accepts completing with an effective date', async () => {
    await expect(
      failedFields(UpdateTransactionStateDto, {
        state: 'COMPLETED',
        completedOn: '2026-10-29',
      }),
    ).resolves.toEqual([]);
  });

  it.each([
    [{ state: 'PLANNED' }, ['state']],
    [{ state: 'CANCELED', completedOn: '2026-10-29' }, ['completedOn']],
  ])('rejects %o', async (body, fields) => {
    await expect(
      failedFields(UpdateTransactionStateDto, body),
    ).resolves.toEqual(fields);
  });
});

describe('ListTransactionsQueryDto', () => {
  it('accepts every filter', async () => {
    await expect(
      failedFields(ListTransactionsQueryDto, {
        from: '2026-10-01',
        to: '2026-10-31',
        type: 'TRANSFER',
        state: 'CANCELED',
        accountUuid: ACCOUNT,
        categoryUuid: CATEGORY,
        description: 'market',
      }),
    ).resolves.toEqual([]);
  });

  it('rejects malformed dates and identifiers', async () => {
    await expect(
      failedFields(ListTransactionsQueryDto, {
        from: '2026-13-01',
        accountUuid: 'x',
      }),
    ).resolves.toEqual(['accountUuid', 'from']);
  });
});
