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
        available: 100000,
        remainingDays: 3,
      }),
    ).toEqual({
      basis: SpendingGuidanceBasis.BUDGET,
      remaining: 100000,
      dailyAllowance: 33333,
    });
  });

  // A planned contribution lowers the available balance only, so without this
  // cap the limit would suggest spending money already set aside.
  it('lowers what is left to the available balance when less money is available than the limit leaves', () => {
    expect(
      spendingGuidance({
        totalLimit: 100000,
        spent: 40000,
        available: 15000,
        remainingDays: 5,
      }),
    ).toEqual({
      basis: SpendingGuidanceBasis.BALANCE,
      remaining: 15000,
      dailyAllowance: 3000,
    });
  });

  it('counts a commitment on both sides once, keeping the budget when it is the lower figure', () => {
    expect(
      spendingGuidance({
        totalLimit: 100000,
        spent: 40000,
        available: 60000,
        remainingDays: 6,
      }),
    ).toEqual({
      basis: SpendingGuidanceBasis.BUDGET,
      remaining: 60000,
      dailyAllowance: 10000,
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
