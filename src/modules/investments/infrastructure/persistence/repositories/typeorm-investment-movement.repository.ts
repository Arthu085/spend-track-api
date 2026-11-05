import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import {
  TransactionState,
  type RecurrenceOccurrenceFilters,
} from '@modules/transactions';
import { parseMoneyTotal } from '@shared/domain/money';
import {
  BaseTransactionalRepository,
  applyExactFilter,
  isUniqueViolation,
} from '@shared/infrastructure/persistence';
import { InvestmentMovementEntity } from '../../../domain/entities/investment-movement.entity';
import { ContributionKind } from '../../../domain/enums/contribution-kind.enum';
import { InvestmentMovementType } from '../../../domain/enums/investment-movement-type.enum';
import { AdditionalContributionAlreadyExistsError } from '../../../domain/errors/additional-contribution-already-exists.error';
import type {
  ContributionKindTotal,
  InvestmentMovementRepository,
  InvestmentMovementTotal,
  MovementAccountFilter,
  MovementDateRange,
  PaginatedInvestmentMovements,
} from '../../../domain/repositories/investment-movement.repository';
import type { InvestmentTotals } from '../../../domain/valuation/investment-value';
import { InvestmentMovementOrmEntity } from '../entities/investment-movement.orm-entity';
import { InvestmentMovementMapper } from '../mappers/investment-movement.mapper';

interface InvestmentTotalsRow {
  investmentId: number;
  contributed: string;
  withdrawn: string;
  adjusted: string;
}

interface AccountTotalRow {
  accountId: number;
  total: string;
}

interface TypeStateTotalRow {
  type: InvestmentMovementType.CONTRIBUTION | InvestmentMovementType.WITHDRAWAL;
  state: TransactionState;
  total: string;
}

interface KindStateTotalRow {
  kind: ContributionKind;
  state: TransactionState;
  total: string;
}

interface RecurrenceTotalRow {
  recurrenceId: number;
  total: string;
}

const ADDITIONAL_MONTH_UNIQUE_INDEX =
  'uq_investment_movements_additional_month';

const TRANSFER_TYPES = [
  InvestmentMovementType.CONTRIBUTION,
  InvestmentMovementType.WITHDRAWAL,
];

@Injectable()
export class TypeOrmInvestmentMovementRepository
  extends BaseTransactionalRepository<InvestmentMovementOrmEntity>
  implements InvestmentMovementRepository
{
  constructor(
    @InjectRepository(InvestmentMovementOrmEntity)
    repository: Repository<InvestmentMovementOrmEntity>,
  ) {
    super(repository);
  }

  async findPaginatedByInvestment(
    ownerId: number,
    investmentId: number,
    offset: number,
    limit: number,
  ): Promise<PaginatedInvestmentMovements> {
    const [rows, total] = await this.movementQuery()
      .where('movement.userId = :ownerId', { ownerId })
      .andWhere('movement.investmentId = :investmentId', { investmentId })
      .andWhere('movement.deletedAt IS NULL')
      .orderBy('movement.date', 'DESC')
      .addOrderBy('movement.id', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return {
      items: rows.map((row) => InvestmentMovementMapper.toDomain(row)),
      total,
    };
  }

  async findByUuidForInvestment(
    uuid: string,
    investmentId: number,
  ): Promise<InvestmentMovementEntity | null> {
    const row = await this.movementQuery()
      .where('movement.uuid = :uuid', { uuid })
      .andWhere('movement.investmentId = :investmentId', { investmentId })
      .andWhere('movement.deletedAt IS NULL')
      .getOne();

    return row ? InvestmentMovementMapper.toDomain(row) : null;
  }

  async findPlannedByInvestment(
    ownerId: number,
    investmentId: number,
  ): Promise<InvestmentMovementEntity[]> {
    const rows = await this.movementQuery()
      .where('movement.userId = :ownerId', { ownerId })
      .andWhere('movement.investmentId = :investmentId', { investmentId })
      .andWhere('movement.state = :planned', {
        planned: TransactionState.PLANNED,
      })
      .andWhere('movement.deletedAt IS NULL')
      .orderBy('movement.date', 'ASC')
      .addOrderBy('movement.id', 'ASC')
      .getMany();

    return rows.map((row) => InvestmentMovementMapper.toDomain(row));
  }

  async sumTotalsByInvestment(
    ownerId: number,
    investmentIds: readonly number[],
  ): Promise<Map<number, InvestmentTotals>> {
    if (investmentIds.length === 0) {
      return new Map();
    }

    const sumOf = (type: InvestmentMovementType): string =>
      `COALESCE(SUM(movement.amount) FILTER (WHERE movement.type = '${type}'), 0)::text`;

    const rows = await this.repository
      .createQueryBuilder('movement')
      .select('movement.investmentId', 'investmentId')
      .addSelect(sumOf(InvestmentMovementType.CONTRIBUTION), 'contributed')
      .addSelect(sumOf(InvestmentMovementType.WITHDRAWAL), 'withdrawn')
      .addSelect(sumOf(InvestmentMovementType.VALUATION), 'adjusted')
      .where('movement.userId = :ownerId', { ownerId })
      .andWhere('movement.investmentId IN (:...investmentIds)', {
        investmentIds,
      })
      .andWhere('movement.state = :completed', {
        completed: TransactionState.COMPLETED,
      })
      .groupBy('movement.investmentId')
      .getRawMany<InvestmentTotalsRow>();

    return new Map(
      rows.map((row) => [
        Number(row.investmentId),
        {
          contributed: parseMoneyTotal(row.contributed),
          withdrawn: parseMoneyTotal(row.withdrawn),
          adjusted: parseMoneyTotal(row.adjusted),
        },
      ]),
    );
  }

  async sumAccountChanges(
    ownerId: number,
    accountIds: readonly number[],
    filter: MovementAccountFilter,
  ): Promise<Map<number, number>> {
    if (accountIds.length === 0) {
      return new Map();
    }

    const qb = this.repository
      .createQueryBuilder('movement')
      .select('movement.accountId', 'accountId')
      .addSelect(
        'SUM(CASE WHEN movement.type = :withdrawal THEN movement.amount ELSE -movement.amount END)::text',
        'total',
      )
      .where('movement.userId = :ownerId', { ownerId })
      .andWhere('movement.accountId IN (:...accountIds)', { accountIds })
      .andWhere('movement.state = :state', { state: filter.state })
      .setParameter('withdrawal', InvestmentMovementType.WITHDRAWAL)
      .groupBy('movement.accountId');

    if (filter.until) {
      qb.andWhere('movement.date <= :until', { until: filter.until });
    }

    const rows = await qb.getRawMany<AccountTotalRow>();

    return new Map(
      rows.map((row) => [Number(row.accountId), parseMoneyTotal(row.total)]),
    );
  }

  async sumByTypeAndState(
    ownerId: number,
    range: MovementDateRange,
  ): Promise<InvestmentMovementTotal[]> {
    const rows = await this.repository
      .createQueryBuilder('movement')
      .select('movement.type', 'type')
      .addSelect('movement.state', 'state')
      .addSelect('SUM(movement.amount)::text', 'total')
      .where('movement.userId = :ownerId', { ownerId })
      .andWhere('movement.date BETWEEN :from AND :to', range)
      .andWhere('movement.type IN (:...types)', { types: TRANSFER_TYPES })
      .andWhere('movement.state IN (:...states)', {
        states: [TransactionState.PLANNED, TransactionState.COMPLETED],
      })
      .groupBy('movement.type')
      .addGroupBy('movement.state')
      .getRawMany<TypeStateTotalRow>();

    return rows.map((row) => ({
      type: row.type,
      state: row.state,
      total: parseMoneyTotal(row.total),
    }));
  }

  async sumContributionsByKindAndState(
    ownerId: number,
    range: MovementDateRange,
  ): Promise<ContributionKindTotal[]> {
    const rows = await this.repository
      .createQueryBuilder('movement')
      .select('movement.contributionKind', 'kind')
      .addSelect('movement.state', 'state')
      .addSelect('SUM(movement.amount)::text', 'total')
      .where('movement.userId = :ownerId', { ownerId })
      .andWhere('movement.date BETWEEN :from AND :to', range)
      .andWhere('movement.type = :contribution', {
        contribution: InvestmentMovementType.CONTRIBUTION,
      })
      .andWhere('movement.state IN (:...states)', {
        states: [TransactionState.PLANNED, TransactionState.COMPLETED],
      })
      .groupBy('movement.contributionKind')
      .addGroupBy('movement.state')
      .getRawMany<KindStateTotalRow>();

    return rows.map((row) => ({
      kind: row.kind,
      state: row.state,
      total: parseMoneyTotal(row.total),
    }));
  }

  async findPaginatedMandatoryByRecurrence(
    ownerId: number,
    recurrenceId: number,
    offset: number,
    limit: number,
    filters: RecurrenceOccurrenceFilters = {},
  ): Promise<PaginatedInvestmentMovements> {
    const qb = this.mandatoryQuery(ownerId, recurrenceId)
      .orderBy('movement.recurrenceDate', 'ASC')
      .addOrderBy('movement.id', 'ASC')
      .skip(offset)
      .take(limit);

    if (filters.from) {
      qb.andWhere('movement.recurrenceDate >= :from', { from: filters.from });
    }

    if (filters.to) {
      qb.andWhere('movement.recurrenceDate <= :to', { to: filters.to });
    }

    applyExactFilter(qb, 'movement.state', 'state', filters.state);

    const [rows, total] = await qb.getManyAndCount();

    return {
      items: rows.map((row) => InvestmentMovementMapper.toDomain(row)),
      total,
    };
  }

  async findMandatoryByUuidForRecurrence(
    uuid: string,
    recurrenceId: number,
  ): Promise<InvestmentMovementEntity | null> {
    const row = await this.movementQuery()
      .where('movement.uuid = :uuid', { uuid })
      .andWhere('movement.recurrenceId = :recurrenceId', { recurrenceId })
      .andWhere('movement.contributionKind = :mandatory', {
        mandatory: ContributionKind.MANDATORY,
      })
      .andWhere('movement.deletedAt IS NULL')
      .getOne();

    return row ? InvestmentMovementMapper.toDomain(row) : null;
  }

  async findPlannedMandatoryByRecurrence(
    ownerId: number,
    recurrenceId: number,
    occurrenceFrom?: string,
  ): Promise<InvestmentMovementEntity[]> {
    const qb = this.mandatoryQuery(ownerId, recurrenceId)
      .andWhere('movement.state = :planned', {
        planned: TransactionState.PLANNED,
      })
      .orderBy('movement.recurrenceDate', 'ASC');

    if (occurrenceFrom) {
      qb.andWhere('movement.recurrenceDate >= :occurrenceFrom', {
        occurrenceFrom,
      });
    }

    const rows = await qb.getMany();

    return rows.map((row) => InvestmentMovementMapper.toDomain(row));
  }

  async findMandatoryDatesFrom(
    ownerId: number,
    recurrenceId: number,
    from: string,
  ): Promise<string[]> {
    const rows = await this.repository
      .createQueryBuilder('movement')
      .select('CAST(movement.recurrenceDate AS text)', 'date')
      .where('movement.userId = :ownerId', { ownerId })
      .andWhere('movement.recurrenceId = :recurrenceId', { recurrenceId })
      .andWhere('movement.contributionKind = :mandatory', {
        mandatory: ContributionKind.MANDATORY,
      })
      .andWhere('movement.recurrenceDate >= :from', { from })
      .getRawMany<{ date: string }>();

    return rows.map(({ date }) => date);
  }

  async findPlannedMandatoryThrough(
    ownerId: number,
    recurrenceIds: readonly number[],
    until: string,
  ): Promise<InvestmentMovementEntity[]> {
    if (recurrenceIds.length === 0) {
      return [];
    }

    const rows = await this.movementQuery()
      .where('movement.userId = :ownerId', { ownerId })
      .andWhere('movement.recurrenceId IN (:...recurrenceIds)', {
        recurrenceIds,
      })
      .andWhere('movement.contributionKind = :mandatory', {
        mandatory: ContributionKind.MANDATORY,
      })
      .andWhere('movement.state = :planned', {
        planned: TransactionState.PLANNED,
      })
      .andWhere('movement.date <= :until', { until })
      .andWhere('movement.deletedAt IS NULL')
      .orderBy('movement.date', 'ASC')
      .addOrderBy('movement.id', 'ASC')
      .getMany();

    return rows.map((row) => InvestmentMovementMapper.toDomain(row));
  }

  async sumCompletedMandatoryByRecurrence(
    ownerId: number,
    recurrenceIds: readonly number[],
    range: MovementDateRange,
  ): Promise<Map<number, number>> {
    if (recurrenceIds.length === 0) {
      return new Map();
    }

    const rows = await this.repository
      .createQueryBuilder('movement')
      .select('movement.recurrenceId', 'recurrenceId')
      .addSelect('SUM(movement.amount)::text', 'total')
      .where('movement.userId = :ownerId', { ownerId })
      .andWhere('movement.recurrenceId IN (:...recurrenceIds)', {
        recurrenceIds,
      })
      .andWhere('movement.contributionKind = :mandatory', {
        mandatory: ContributionKind.MANDATORY,
      })
      .andWhere('movement.state = :completed', {
        completed: TransactionState.COMPLETED,
      })
      .andWhere('movement.date BETWEEN :from AND :to', range)
      .groupBy('movement.recurrenceId')
      .getRawMany<RecurrenceTotalRow>();

    return new Map(
      rows.map((row) => [Number(row.recurrenceId), parseMoneyTotal(row.total)]),
    );
  }

  async findLiveAdditionalByMonth(
    ownerId: number,
    recurrenceIds: readonly number[],
    surplusMonth: string,
  ): Promise<InvestmentMovementEntity[]> {
    if (recurrenceIds.length === 0) {
      return [];
    }

    const rows = await this.movementQuery()
      .where('movement.userId = :ownerId', { ownerId })
      .andWhere('movement.recurrenceId IN (:...recurrenceIds)', {
        recurrenceIds,
      })
      .andWhere('movement.contributionKind = :additional', {
        additional: ContributionKind.ADDITIONAL,
      })
      .andWhere('movement.surplusMonth = :surplusMonth', { surplusMonth })
      .andWhere('movement.state <> :canceled', {
        canceled: TransactionState.CANCELED,
      })
      .andWhere('movement.deletedAt IS NULL')
      .getMany();

    return rows.map((row) => InvestmentMovementMapper.toDomain(row));
  }

  async existsForAccount(ownerId: number, accountId: number): Promise<boolean> {
    return this.repository.exists({ where: { userId: ownerId, accountId } });
  }

  async findEarliestDateForAccount(
    ownerId: number,
    accountId: number,
  ): Promise<string | null> {
    const row = await this.repository
      .createQueryBuilder('movement')
      .select(
        'MIN(LEAST(movement.date, COALESCE(movement.completedOn, movement.date)))::text',
        'earliest',
      )
      .where('movement.userId = :ownerId', { ownerId })
      .andWhere('movement.accountId = :accountId', { accountId })
      .andWhere('movement.state IN (:...states)', {
        states: [TransactionState.PLANNED, TransactionState.COMPLETED],
      })
      .getRawOne<{ earliest: string | null }>();

    return row?.earliest ?? null;
  }

  async existsForInvestment(
    ownerId: number,
    investmentId: number,
  ): Promise<boolean> {
    return this.repository.exists({
      where: { userId: ownerId, investmentId },
    });
  }

  async create(
    movement: InvestmentMovementEntity,
  ): Promise<InvestmentMovementEntity> {
    return this.saveAndReload(movement);
  }

  async update(
    movement: InvestmentMovementEntity,
  ): Promise<InvestmentMovementEntity> {
    return this.saveAndReload(movement);
  }

  async softDelete(movement: InvestmentMovementEntity): Promise<void> {
    await this.repository.softDelete({ id: movement.id });
  }

  private movementQuery(): SelectQueryBuilder<InvestmentMovementOrmEntity> {
    return this.repository
      .createQueryBuilder('movement')
      .withDeleted()
      .leftJoinAndSelect('movement.account', 'account')
      .leftJoinAndSelect('movement.recurrence', 'recurrence');
  }

  private mandatoryQuery(
    ownerId: number,
    recurrenceId: number,
  ): SelectQueryBuilder<InvestmentMovementOrmEntity> {
    return this.movementQuery()
      .where('movement.userId = :ownerId', { ownerId })
      .andWhere('movement.recurrenceId = :recurrenceId', { recurrenceId })
      .andWhere('movement.contributionKind = :mandatory', {
        mandatory: ContributionKind.MANDATORY,
      })
      .andWhere('movement.deletedAt IS NULL');
  }

  private async saveAndReload(
    movement: InvestmentMovementEntity,
  ): Promise<InvestmentMovementEntity> {
    const saved = await this.save(movement);

    return InvestmentMovementMapper.toDomain(
      await this.movementQuery()
        .where('movement.id = :id', { id: saved.id })
        .getOneOrFail(),
    );
  }

  private async save(
    movement: InvestmentMovementEntity,
  ): Promise<InvestmentMovementOrmEntity> {
    try {
      return await this.repository.save(
        InvestmentMovementMapper.toOrm(movement),
      );
    } catch (error) {
      if (isUniqueViolation(error, ADDITIONAL_MONTH_UNIQUE_INDEX)) {
        throw new AdditionalContributionAlreadyExistsError();
      }

      throw error;
    }
  }
}
