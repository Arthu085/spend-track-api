import { TransactionCategoryKind } from '@modules/transaction-categories';
import { TransactionState } from '@modules/transactions';
import { buildAccount } from '@test/support/builders/account.builder';
import { buildCreditCard } from '@test/support/builders/credit-card.builder';
import {
  buildRecurrence,
  buildRecurrenceCardCharge,
} from '@test/support/builders/recurrence.builder';
import { buildTransactionCategory } from '@test/support/builders/transaction-category.builder';
import { RecurrenceFrequency } from '../../enums/recurrence-frequency.enum';
import { RecurrenceState } from '../../enums/recurrence-state.enum';
import { RecurrenceType } from '../../enums/recurrence-type.enum';
import { InvalidRecurrenceTargetError } from '../../errors/invalid-recurrence-target.error';
import { RecurrenceCategoryKindMismatchError } from '../../errors/recurrence-category-kind-mismatch.error';
import { RecurrenceEndBeforeStartError } from '../../errors/recurrence-end-before-start.error';
import { RecurrenceEndedError } from '../../errors/recurrence-ended.error';
import { RecurrenceOccurrenceNotPlannedError } from '../../errors/recurrence-occurrence-not-planned.error';
import { RecurrenceStateTransitionError } from '../../errors/recurrence-state-transition.error';
import {
  RecurrenceEntity,
  type CreateRecurrenceInput,
} from '../recurrence.entity';

describe('RecurrenceEntity', () => {
  const input = (
    overrides: Partial<CreateRecurrenceInput> = {},
  ): CreateRecurrenceInput => ({
    uuid: 'new',
    ownerId: 1,
    type: RecurrenceType.EXPENSE,
    description: 'Rent',
    amount: 150000,
    frequency: RecurrenceFrequency.MONTHLY,
    startDate: '2026-10-15',
    endDate: null,
    account: buildAccount(),
    creditCard: null,
    category: buildTransactionCategory(),
    notes: null,
    ...overrides,
  });

  it('starts active with nothing generated', () => {
    const recurrence = RecurrenceEntity.create(input());

    expect(recurrence.state).toBe(RecurrenceState.ACTIVE);
    expect(recurrence.generatedThrough).toBeNull();
  });

  it.each([
    ['no target', { account: null }],
    ['both targets', { creditCard: buildCreditCard() }],
    [
      'a card on an income',
      {
        type: RecurrenceType.INCOME,
        account: null,
        creditCard: buildCreditCard(),
        category: buildTransactionCategory({
          kind: TransactionCategoryKind.INCOME,
        }),
      },
    ],
  ])('rejects %s', (_, overrides) => {
    expect(() => RecurrenceEntity.create(input(overrides))).toThrow(
      InvalidRecurrenceTargetError,
    );
  });

  it('rejects a category of the other kind and an end before the start', () => {
    expect(() =>
      RecurrenceEntity.create(
        input({
          category: buildTransactionCategory({
            kind: TransactionCategoryKind.INCOME,
          }),
        }),
      ),
    ).toThrow(RecurrenceCategoryKindMismatchError);
    expect(() =>
      RecurrenceEntity.create(input({ endDate: '2026-10-14' })),
    ).toThrow(RecurrenceEndBeforeStartError);
  });

  it('generates only dates after the cursor and up to the end date', () => {
    const recurrence = buildRecurrence({
      generatedThrough: '2026-11-30',
      endDate: '2027-01-20',
    });

    expect(recurrence.datesToGenerate('2027-11-30')).toEqual([
      '2026-12-15',
      '2027-01-15',
    ]);
    expect(
      recurrence.generatedUntil('2027-01-20').datesToGenerate('2027-11-30'),
    ).toEqual([]);
  });

  it('never moves the generation cursor back', () => {
    const recurrence = buildRecurrence({ generatedThrough: '2027-11-30' });

    expect(recurrence.generatedUntil('2027-10-31').generatedThrough).toBe(
      '2027-11-30',
    );
  });

  it('reports ENDED once the end date has passed and refuses changes', () => {
    const recurrence = buildRecurrence({ endDate: '2026-11-02' });

    expect(recurrence.stateOn('2026-11-03')).toBe(RecurrenceState.ENDED);
    expect(recurrence.nextOccurrenceDate('2026-11-03')).toBeNull();
    expect(() => recurrence.assertChangeable('2026-11-03')).toThrow(
      RecurrenceEndedError,
    );
  });

  it('gives the next scheduled date from today on', () => {
    expect(buildRecurrence().nextOccurrenceDate('2026-11-16')).toBe(
      '2026-12-15',
    );
    expect(buildRecurrence().nextOccurrenceDate('2026-09-01')).toBe(
      '2026-10-15',
    );
  });

  it('gives the next date generation can create when the account opens later', () => {
    const recurrence = buildRecurrence({
      account: buildAccount({ openingBalanceDate: '2027-02-01' }),
    });

    expect(recurrence.nextOccurrenceDate('2026-11-16')).toBe('2027-02-15');
  });

  it('pauses from today and resumes without the skipped dates', () => {
    const paused = buildRecurrence({ generatedThrough: '2027-11-30' }).pause(
      '2026-11-03',
    );

    expect(paused.state).toBe(RecurrenceState.PAUSED);
    expect(paused.generatedThrough).toBe('2026-11-02');
    expect(paused.datesToGenerate('2027-11-30')).toEqual([]);
    expect(() => paused.pause('2026-11-03')).toThrow(
      RecurrenceStateTransitionError,
    );

    const resumed = paused.resume('2027-02-01');

    expect(resumed.state).toBe(RecurrenceState.ACTIVE);
    expect(resumed.datesToGenerate('2027-03-31')).toEqual([
      '2027-02-15',
      '2027-03-15',
    ]);
  });

  it('ends before a cut date, keeping an earlier end', () => {
    expect(
      buildRecurrence().endBefore('2026-12-15', '2026-11-03').endDate,
    ).toBe('2026-12-14');
    expect(
      buildRecurrence({ endDate: '2026-11-30' }).endBefore(
        '2027-03-01',
        '2026-11-03',
      ).endDate,
    ).toBe('2026-11-30');
  });

  it('ends as a whole without a cut or with a cut on the start date', () => {
    for (const cut of [null, '2026-10-15']) {
      const ended = buildRecurrence().endBefore(cut, '2026-11-03');

      expect(ended.state).toBe(RecurrenceState.ENDED);
      expect(ended.datesToGenerate('2027-11-30')).toEqual([]);
    }
  });

  it('refuses an account on a card recurrence', () => {
    const recurrence = buildRecurrence({
      account: null,
      creditCard: buildCreditCard(),
    });

    expect(() =>
      recurrence.withDetails({
        description: 'Netflix',
        amount: 5590,
        category: recurrence.category,
        account: buildAccount(),
        notes: null,
      }),
    ).toThrow(InvalidRecurrenceTargetError);
  });
});

describe('RecurrenceCardChargeEntity', () => {
  it('starts planned on its scheduled date', () => {
    const charge = buildRecurrenceCardCharge();

    expect(charge.state).toBe(TransactionState.PLANNED);
    expect(charge.date).toBe(charge.occurrenceDate);
  });

  it('completes with the purchase and the confirmed amount and date', () => {
    const completed = buildRecurrenceCardCharge().complete(
      { id: 9, uuid: 'purchase' },
      { amount: 5990, date: '2026-11-16', invoiceMonth: '2026-12-01' },
    );

    expect(completed).toMatchObject({
      state: TransactionState.COMPLETED,
      amount: 5990,
      date: '2026-11-16',
      occurrenceDate: '2026-11-15',
      purchase: { id: 9, uuid: 'purchase' },
    });
  });

  it('skips a planned charge and refuses to change it afterwards', () => {
    const canceled = buildRecurrenceCardCharge().cancel();

    expect(canceled.state).toBe(TransactionState.CANCELED);
    expect(canceled.canceledAt).toBeInstanceOf(Date);
    expect(() => canceled.cancel()).toThrow(
      RecurrenceOccurrenceNotPlannedError,
    );
    expect(() =>
      canceled.rescheduled({
        amount: 1,
        date: '2026-11-20',
        invoiceMonth: '2026-12-01',
      }),
    ).toThrow(RecurrenceOccurrenceNotPlannedError);
  });
});
