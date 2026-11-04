import type { TransactionState } from '@modules/transactions';
import { InvestmentMovementEntity } from '../entities/investment-movement.entity';
import { InvestmentMovementType } from '../enums/investment-movement-type.enum';
import type { InvestmentTotals } from '../valuation/investment-value';

export const INVESTMENT_MOVEMENT_REPOSITORY = Symbol(
  'INVESTMENT_MOVEMENT_REPOSITORY',
);

export interface PaginatedInvestmentMovements {
  items: InvestmentMovementEntity[];
  total: number;
}

export interface MovementDateRange {
  from: string;
  to: string;
}

export interface MovementAccountFilter {
  state: TransactionState;
  until?: string;
}

export interface InvestmentMovementTotal {
  type: InvestmentMovementType.CONTRIBUTION | InvestmentMovementType.WITHDRAWAL;
  state: TransactionState;
  total: number;
}

export interface InvestmentMovementRepository {
  findPaginatedByInvestment(
    ownerId: number,
    investmentId: number,
    offset: number,
    limit: number,
  ): Promise<PaginatedInvestmentMovements>;
  findByUuidForInvestment(
    uuid: string,
    investmentId: number,
  ): Promise<InvestmentMovementEntity | null>;
  sumTotalsByInvestment(
    ownerId: number,
    investmentIds: readonly number[],
  ): Promise<Map<number, InvestmentTotals>>;
  sumAccountChanges(
    ownerId: number,
    accountIds: readonly number[],
    filter: MovementAccountFilter,
  ): Promise<Map<number, number>>;
  sumByTypeAndState(
    ownerId: number,
    range: MovementDateRange,
  ): Promise<InvestmentMovementTotal[]>;
  existsForAccount(ownerId: number, accountId: number): Promise<boolean>;
  existsForInvestment(ownerId: number, investmentId: number): Promise<boolean>;
  create(movement: InvestmentMovementEntity): Promise<InvestmentMovementEntity>;
  update(movement: InvestmentMovementEntity): Promise<InvestmentMovementEntity>;
}
