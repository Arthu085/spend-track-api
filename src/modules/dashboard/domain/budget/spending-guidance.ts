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

export function spendingGuidance(
  input: SpendingGuidanceInput,
): SpendingGuidance {
  const basis =
    input.totalLimit === null
      ? SpendingGuidanceBasis.BALANCE
      : SpendingGuidanceBasis.BUDGET;

  const remaining = Math.max(
    0,
    input.totalLimit === null
      ? input.available
      : input.totalLimit - input.spent,
  );

  return {
    basis,
    remaining,
    dailyAllowance:
      input.remainingDays > 0
        ? Math.floor(remaining / input.remainingDays)
        : null,
  };
}
