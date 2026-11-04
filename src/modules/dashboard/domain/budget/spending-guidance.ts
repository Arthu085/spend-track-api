export enum SpendingGuidanceBasis {
  BUDGET = 'BUDGET',
  BALANCE = 'BALANCE',
}

export interface LimitProgress {
  limit: number;
  remaining: number;
  overspent: number;
}

export interface SpendingGuidance {
  basis: SpendingGuidanceBasis;
  remaining: number;
  dailyAllowance: number | null;
}

export interface SpendingGuidanceInput {
  totalLimit: number | null;
  spent: number;
  available: number;
  remainingDays: number;
}

export function limitProgress(limit: number, spent: number): LimitProgress {
  return {
    limit,
    remaining: Math.max(0, limit - spent),
    overspent: Math.max(0, spent - limit),
  };
}

function tightestLimit({
  totalLimit,
  spent,
  available,
}: SpendingGuidanceInput): { basis: SpendingGuidanceBasis; amount: number } {
  if (totalLimit !== null && totalLimit - spent <= available) {
    return { basis: SpendingGuidanceBasis.BUDGET, amount: totalLimit - spent };
  }

  return { basis: SpendingGuidanceBasis.BALANCE, amount: available };
}

export function spendingGuidance(
  input: SpendingGuidanceInput,
): SpendingGuidance {
  const { basis, amount } = tightestLimit(input);
  const remaining = Math.max(0, amount);

  return {
    basis,
    remaining,
    dailyAllowance:
      input.remainingDays > 0
        ? Math.floor(remaining / input.remainingDays)
        : null,
  };
}
