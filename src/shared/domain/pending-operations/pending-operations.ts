import { sumMoney } from '../money';

export enum PendingOperationsDecision {
  KEEP = 'KEEP',
  CANCEL = 'CANCEL',
}

export interface PendingOperationsSummary {
  count: number;
  total: number;
}

export function summarizePendingOperations(
  amounts: readonly number[],
): PendingOperationsSummary {
  return { count: amounts.length, total: sumMoney(amounts) };
}
