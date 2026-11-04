import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import { TransactionState } from '@modules/transactions';
import { parseMoneyTotal } from '@shared/domain/money';
import { BaseTransactionalRepository } from '@shared/infrastructure/persistence';
import { InvestmentMovementEntity } from '../../../domain/entities/investment-movement.entity';
import { InvestmentMovementType } from '../../../domain/enums/investment-movement-type.enum';
import type {
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

  private movementQuery(): SelectQueryBuilder<InvestmentMovementOrmEntity> {
    return this.repository
      .createQueryBuilder('movement')
      .withDeleted()
      .leftJoinAndSelect('movement.account', 'account');
  }

  private async saveAndReload(
    movement: InvestmentMovementEntity,
  ): Promise<InvestmentMovementEntity> {
    const saved = await this.repository.save(
      InvestmentMovementMapper.toOrm(movement),
    );

    return InvestmentMovementMapper.toDomain(
      await this.movementQuery()
        .where('movement.id = :id', { id: saved.id })
        .getOneOrFail(),
    );
  }
}
