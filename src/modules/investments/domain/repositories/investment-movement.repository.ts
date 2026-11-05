import type {
  RecurrenceOccurrenceFilters,
  TransactionState,
} from '@modules/transactions';
import { InvestmentMovementEntity } from '../entities/investment-movement.entity';
import { ContributionKind } from '../enums/contribution-kind.enum';
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

export interface ContributionKindTotal {
  kind: ContributionKind;
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
  findPlannedByInvestment(
    ownerId: number,
    investmentId: number,
  ): Promise<InvestmentMovementEntity[]>;
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
  sumContributionsByKindAndState(
    ownerId: number,
    range: MovementDateRange,
  ): Promise<ContributionKindTotal[]>;
  findPaginatedMandatoryByRecurrence(
    ownerId: number,
    recurrenceId: number,
    offset: number,
    limit: number,
    filters?: RecurrenceOccurrenceFilters,
  ): Promise<PaginatedInvestmentMovements>;
  findMandatoryByUuidForRecurrence(
    uuid: string,
    recurrenceId: number,
  ): Promise<InvestmentMovementEntity | null>;
  findPlannedMandatoryByRecurrence(
    ownerId: number,
    recurrenceId: number,
    occurrenceFrom?: string,
  ): Promise<InvestmentMovementEntity[]>;
  findMandatoryDatesFrom(
    ownerId: number,
    recurrenceId: number,
    from: string,
  ): Promise<string[]>;
  findPlannedMandatoryThrough(
    ownerId: number,
    recurrenceIds: readonly number[],
    until: string,
  ): Promise<InvestmentMovementEntity[]>;
  sumCompletedMandatoryByRecurrence(
    ownerId: number,
    recurrenceIds: readonly number[],
    range: MovementDateRange,
  ): Promise<Map<number, number>>;
  findLiveAdditionalByMonth(
    ownerId: number,
    recurrenceIds: readonly number[],
    surplusMonth: string,
  ): Promise<InvestmentMovementEntity[]>;
  existsForAccount(ownerId: number, accountId: number): Promise<boolean>;
  findEarliestDateForAccount(
    ownerId: number,
    accountId: number,
  ): Promise<string | null>;
  existsForInvestment(ownerId: number, investmentId: number): Promise<boolean>;
  create(movement: InvestmentMovementEntity): Promise<InvestmentMovementEntity>;
  update(movement: InvestmentMovementEntity): Promise<InvestmentMovementEntity>;
  softDelete(movement: InvestmentMovementEntity): Promise<void>;
}
