import { PeriodTiming, resolveMonthPeriod, shiftMonth } from '../month-period';

describe('month period', () => {
  it.each([
    [{ year: 2026, month: 12 }, 1, { year: 2027, month: 1 }],
    [{ year: 2026, month: 1 }, -1, { year: 2025, month: 12 }],
    [{ year: 2026, month: 10 }, 0, { year: 2026, month: 10 }],
  ])('shifts %o by %i months', (ref, offset, expected) => {
    expect(shiftMonth(ref, offset)).toEqual(expected);
  });

  it('counts today among the remaining days of the current month', () => {
    expect(resolveMonthPeriod({ year: 2026, month: 10 }, '2026-10-29')).toEqual(
      {
        year: 2026,
        month: 10,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        today: '2026-10-29',
        daysInMonth: 31,
        timing: PeriodTiming.CURRENT,
        remainingDays: 3,
      },
    );
  });

  it('leaves one remaining day on the last day of the month', () => {
    expect(
      resolveMonthPeriod({ year: 2026, month: 10 }, '2026-10-31').remainingDays,
    ).toBe(1);
  });

  it('has no remaining days in a past month', () => {
    const period = resolveMonthPeriod({ year: 2026, month: 9 }, '2026-10-29');

    expect(period.timing).toBe(PeriodTiming.PAST);
    expect(period.remainingDays).toBe(0);
  });

  it('keeps every day of a future month, including leap February', () => {
    const period = resolveMonthPeriod({ year: 2028, month: 2 }, '2026-10-29');

    expect(period).toMatchObject({
      timing: PeriodTiming.FUTURE,
      endDate: '2028-02-29',
      daysInMonth: 29,
      remainingDays: 29,
    });
  });
});
