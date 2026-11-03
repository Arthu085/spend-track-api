import {
  SpendingGuidanceBasis,
  limitProgress,
  spendingGuidance,
} from '../spending-guidance';

describe('limitProgress', () => {
  it('reports what is left under the limit', () => {
    expect(limitProgress(10000, 2500)).toEqual({
      limit: 10000,
      remaining: 7500,
      overspent: 0,
    });
  });

  it('reports the amount above the limit', () => {
    expect(limitProgress(10000, 12001)).toEqual({
      limit: 10000,
      remaining: 0,
      overspent: 2001,
    });
  });
});

describe('spendingGuidance', () => {
  it('divides the remaining budget by the remaining days, rounding down to the cent', () => {
    expect(
      spendingGuidance({
        totalLimit: 100000,
        spent: 0,
        available: -50000,
        remainingDays: 3,
      }),
    ).toEqual({
      basis: SpendingGuidanceBasis.BUDGET,
      remaining: 100000,
      dailyAllowance: 33333,
    });
  });

  it('falls back to the available balance without an overall limit', () => {
    expect(
      spendingGuidance({
        totalLimit: null,
        spent: 90000,
        available: 3100,
        remainingDays: 31,
      }),
    ).toEqual({
      basis: SpendingGuidanceBasis.BALANCE,
      remaining: 3100,
      dailyAllowance: 100,
    });
  });

  it('never suggests a negative amount', () => {
    expect(
      spendingGuidance({
        totalLimit: null,
        spent: 0,
        available: -100,
        remainingDays: 2,
      }),
    ).toEqual({
      basis: SpendingGuidanceBasis.BALANCE,
      remaining: 0,
      dailyAllowance: 0,
    });
  });

  it('gives no daily allowance when no day is left', () => {
    expect(
      spendingGuidance({
        totalLimit: 1000,
        spent: 400,
        available: 0,
        remainingDays: 0,
      }).dailyAllowance,
    ).toBeNull();
  });
});
