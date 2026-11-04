export interface InvestmentTotals {
  contributed: number;
  withdrawn: number;
  adjusted: number;
}

export interface InvestmentValue extends InvestmentTotals {
  current: number;
}

export interface TargetProgress {
  remaining: number;
  percent: number;
}

export const EMPTY_INVESTMENT_TOTALS: InvestmentTotals = {
  contributed: 0,
  withdrawn: 0,
  adjusted: 0,
};

export function investmentValueOf(totals: InvestmentTotals): InvestmentValue {
  return {
    ...totals,
    current: totals.contributed - totals.withdrawn + totals.adjusted,
  };
}

export function targetProgress(
  current: number,
  target: number,
): TargetProgress {
  return {
    remaining: Math.max(target - current, 0),
    percent: Math.max(Math.floor((current * 100) / target), 0),
  };
}
