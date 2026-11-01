import {
  FINANCE_TIME_ZONE,
  calendarDateIn,
  financeToday,
} from '../calendar-date';

describe('calendar date', () => {
  // 02:30 UTC on Nov 1 is still Oct 31 in São Paulo (UTC-3).
  it('reads the calendar date in the finance time zone', () => {
    expect(
      calendarDateIn(new Date('2026-11-01T02:30:00Z'), FINANCE_TIME_ZONE),
    ).toBe('2026-10-31');
  });

  it("reads today's date in the finance time zone", () => {
    expect(financeToday(new Date('2026-11-01T03:30:00Z'))).toBe('2026-11-01');
  });
});
