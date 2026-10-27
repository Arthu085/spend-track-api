import { toUtcDay } from '../utc-day';

describe('toUtcDay', () => {
  it('formats a date as a "YYYY-MM-DD" UTC calendar day', () => {
    const date = new Date(Date.UTC(2026, 6, 8, 12, 30, 45));

    expect(toUtcDay(date)).toBe('2026-07-08');
  });

  it('places instants just before and just after a UTC midnight boundary on different calendar days', () => {
    const justBeforeMidnight = new Date(Date.UTC(2026, 6, 8, 23, 59, 59));
    const justAfterMidnight = new Date(Date.UTC(2026, 6, 9, 0, 0, 1));

    expect(toUtcDay(justBeforeMidnight)).toBe('2026-07-08');
    expect(toUtcDay(justAfterMidnight)).toBe('2026-07-09');
    expect(toUtcDay(justBeforeMidnight)).not.toBe(toUtcDay(justAfterMidnight));
  });

  it('uses the UTC calendar day, not the host machine local calendar day', () => {
    // Mutating `process.env.TZ` mid-process is not portable, so instead of
    // forcing a local/UTC divergence, assert the local-time getters are never
    // consulted.
    const date = new Date(Date.UTC(2026, 0, 1, 2, 0, 0));
    const getFullYearSpy = jest.spyOn(Date.prototype, 'getFullYear');
    const getMonthSpy = jest.spyOn(Date.prototype, 'getMonth');
    const getDateSpy = jest.spyOn(Date.prototype, 'getDate');

    const result = toUtcDay(date);

    expect(getFullYearSpy).not.toHaveBeenCalled();
    expect(getMonthSpy).not.toHaveBeenCalled();
    expect(getDateSpy).not.toHaveBeenCalled();
    expect(result).toBe('2026-01-01');

    getFullYearSpy.mockRestore();
    getMonthSpy.mockRestore();
    getDateSpy.mockRestore();
  });
});
