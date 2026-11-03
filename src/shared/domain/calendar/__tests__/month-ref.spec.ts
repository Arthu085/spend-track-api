import {
  addMonthsToDate,
  compareMonths,
  dayOfMonth,
  lastDayOf,
} from '../month-ref';

describe('month ref', () => {
  it.each([
    ['2026-10-29', 1, '2026-11-29'],
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2026-12-15', 2, '2027-02-15'],
    ['2026-03-31', -1, '2026-02-28'],
  ])(
    'shifts %s by %i months, clamping to the month end',
    (date, offset, expected) => {
      expect(addMonthsToDate(date, offset)).toBe(expected);
    },
  );

  it('builds dates inside a month', () => {
    expect(dayOfMonth({ year: 2026, month: 2 }, 31)).toBe('2026-02-28');
    expect(lastDayOf({ year: 2026, month: 4 })).toBe('2026-04-30');
  });

  it('compares months', () => {
    expect(
      compareMonths({ year: 2027, month: 1 }, { year: 2026, month: 12 }),
    ).toBeGreaterThan(0);
  });
});
