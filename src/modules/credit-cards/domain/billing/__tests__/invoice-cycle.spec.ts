import {
  invoiceCycleOf,
  invoiceReferenceFor,
  isInvoiceClosed,
} from '../invoice-cycle';
import { splitInstallments } from '../split-installments';

describe('invoice cycle', () => {
  it('closes in the due month when the closing day comes first', () => {
    expect(
      invoiceCycleOf({ closingDay: 5, dueDay: 12 }, { year: 2026, month: 11 }),
    ).toEqual({
      referenceMonth: '2026-11-01',
      closingDate: '2026-11-05',
      dueDate: '2026-11-12',
    });
  });

  it('closes in the previous month, across the year, when the closing day is on or after the due day', () => {
    expect(
      invoiceCycleOf({ closingDay: 25, dueDay: 5 }, { year: 2027, month: 1 }),
    ).toEqual({
      referenceMonth: '2027-01-01',
      closingDate: '2026-12-25',
      dueDate: '2027-01-05',
    });
  });

  it('clamps days to the last day of short months', () => {
    expect(
      invoiceCycleOf({ closingDay: 31, dueDay: 30 }, { year: 2027, month: 3 }),
    ).toEqual({
      referenceMonth: '2027-03-01',
      closingDate: '2027-02-28',
      dueDate: '2027-03-30',
    });
  });

  it.each([
    ['2026-10-29', { closingDay: 5, dueDay: 12 }, { year: 2026, month: 11 }],
    ['2026-11-04', { closingDay: 5, dueDay: 12 }, { year: 2026, month: 11 }],
    ['2026-11-05', { closingDay: 5, dueDay: 12 }, { year: 2026, month: 12 }],
    ['2026-12-20', { closingDay: 5, dueDay: 12 }, { year: 2027, month: 1 }],
    ['2026-10-24', { closingDay: 25, dueDay: 5 }, { year: 2026, month: 11 }],
    ['2026-10-25', { closingDay: 25, dueDay: 5 }, { year: 2026, month: 12 }],
    ['2026-12-31', { closingDay: 25, dueDay: 5 }, { year: 2027, month: 2 }],
  ])(
    'bills a purchase on %s to the first invoice closing after it',
    (date, days, expected) => {
      expect(invoiceReferenceFor(days, date)).toEqual(expected);
    },
  );

  it('treats an invoice as closed from its closing date on', () => {
    expect(isInvoiceClosed({ closingDate: '2026-11-05' }, '2026-11-04')).toBe(
      false,
    );
    expect(isInvoiceClosed({ closingDate: '2026-11-05' }, '2026-11-05')).toBe(
      true,
    );
  });
});

describe('splitInstallments', () => {
  it.each([
    [30000, 3, [10000, 10000, 10000]],
    [10000, 3, [3334, 3333, 3333]],
    [5, 5, [1, 1, 1, 1, 1]],
    [999, 1, [999]],
  ])(
    'splits %i cents into %i installments that add up',
    (total, count, expected) => {
      const parts = splitInstallments(total, count);

      expect(parts).toEqual(expected);
      expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total);
    },
  );
});
