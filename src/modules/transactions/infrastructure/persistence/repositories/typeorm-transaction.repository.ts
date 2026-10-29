import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository, type SelectQueryBuilder } from 'typeorm';
import {
  TransactionCategoryMapper,
  TransactionCategoryOrmEntity,
} from '@modules/transaction-categories/persistence';
import { parseMoneyTotal } from '@shared/domain/money';
import {
  BaseTransactionalRepository,
  applyExactFilter,
  applyILikeFilter,
} from '@shared/infrastructure/persistence';
import { TransactionEntity } from '../../../domain/entities/transaction.entity';
import { TransactionState } from '../../../domain/enums/transaction-state.enum';
import { TransactionType } from '../../../domain/enums/transaction-type.enum';
import type {
  BalanceChangeFilter,
  CategoryExpenseTotal,
  DateRange,
  PaginatedTransactions,
  TransactionListFilters,
  TransactionRepository,
  TransactionTotal,
} from '../../../domain/repositories/transaction.repository';
import { TransactionOrmEntity } from '../entities/transaction.orm-entity';
import { TransactionMapper } from '../mappers/transaction.mapper';

interface AccountTotalRow {
  accountId: number;
  total: string;
}

interface TypeStateTotalRow {
  type: TransactionType;
  state: TransactionState;
  total: string;
}

interface CategoryTotalRow {
  categoryId: number;
  state: TransactionState;
  total: string;
}

const COUNTED_STATES = [TransactionState.PLANNED, TransactionState.COMPLETED];

@Injectable()
export class TypeOrmTransactionRepository
  extends BaseTransactionalRepository<TransactionOrmEntity>
  implements TransactionRepository
{
  constructor(
    @InjectRepository(TransactionOrmEntity)
    repository: Repository<TransactionOrmEntity>,
  ) {
    super(repository);
  }

  async findAllPaginatedByOwner(
    ownerId: number,
    offset: number,
    limit: number,
    filters: TransactionListFilters = {},
  ): Promise<PaginatedTransactions> {
    const qb = this.ownerQuery(ownerId)
      .orderBy('transaction.date', 'DESC')
      .addOrderBy('transaction.id', 'DESC')
      .skip(offset)
      .take(limit);

    if (filters.from) {
      qb.andWhere('transaction.date >= :from', { from: filters.from });
    }

    if (filters.to) {
      qb.andWhere('transaction.date <= :to', { to: filters.to });
    }

    applyExactFilter(qb, 'transaction.type', 'type', filters.type);
    applyExactFilter(qb, 'transaction.state', 'state', filters.state);
    applyExactFilter(qb, 'category.uuid', 'categoryUuid', filters.categoryUuid);
    applyILikeFilter(
      qb,
      'transaction.description',
      'description',
      filters.description,
    );

    if (filters.accountUuid) {
      qb.andWhere(
        new Brackets((either) =>
          either
            .where('account.uuid = :accountUuid')
            .orWhere('destinationAccount.uuid = :accountUuid'),
        ),
        { accountUuid: filters.accountUuid },
      );
    }

    const [rows, total] = await qb.getManyAndCount();

    return { items: rows.map((row) => TransactionMapper.toDomain(row)), total };
  }

  async findByUuidForOwner(
    uuid: string,
    ownerId: number,
  ): Promise<TransactionEntity | null> {
    const row = await this.ownerQuery(ownerId)
      .andWhere('transaction.uuid = :uuid', { uuid })
      .getOne();

    return row ? TransactionMapper.toDomain(row) : null;
  }

  async findByUuidForOwnerForUpdate(
    uuid: string,
    ownerId: number,
  ): Promise<TransactionEntity | null> {
    await this.repository
      .createQueryBuilder('transaction')
      .select('transaction.id')
      .where('transaction.uuid = :uuid', { uuid })
      .andWhere('transaction.userId = :ownerId', { ownerId })
      .setLock('for_no_key_update')
      .getOne();

    return this.findByUuidForOwner(uuid, ownerId);
  }

  async findPlannedUntil(
    ownerId: number,
    until: string,
    limit: number,
  ): Promise<PaginatedTransactions> {
    const [rows, total] = await this.ownerQuery(ownerId)
      .andWhere('transaction.state = :state', {
        state: TransactionState.PLANNED,
      })
      .andWhere('transaction.date <= :until', { until })
      .orderBy('transaction.date', 'ASC')
      .addOrderBy('transaction.id', 'ASC')
      .take(limit)
      .getManyAndCount();

    return { items: rows.map((row) => TransactionMapper.toDomain(row)), total };
  }

  async sumBalanceChanges(
    ownerId: number,
    accountIds: readonly number[],
    filter: BalanceChangeFilter,
  ): Promise<Map<number, number>> {
    const changes = new Map<number, number>();

    if (accountIds.length === 0) {
      return changes;
    }

    const outgoing = await this.balanceQuery(ownerId, filter)
      .select('transaction.accountId', 'accountId')
      .addSelect(
        `SUM(CASE WHEN transaction.type = :income THEN transaction.amount ELSE -transaction.amount END)::text`,
        'total',
      )
      .andWhere('transaction.accountId IN (:...accountIds)', { accountIds })
      .setParameter('income', TransactionType.INCOME)
      .groupBy('transaction.accountId')
      .getRawMany<AccountTotalRow>();

    const incoming = await this.balanceQuery(ownerId, filter)
      .select('transaction.destinationAccountId', 'accountId')
      .addSelect('SUM(transaction.amount)::text', 'total')
      .andWhere('transaction.destinationAccountId IN (:...accountIds)', {
        accountIds,
      })
      .groupBy('transaction.destinationAccountId')
      .getRawMany<AccountTotalRow>();

    for (const row of [...outgoing, ...incoming]) {
      const accountId = Number(row.accountId);

      changes.set(
        accountId,
        (changes.get(accountId) ?? 0) + parseMoneyTotal(row.total),
      );
    }

    return changes;
  }

  async existsForAccount(ownerId: number, accountId: number): Promise<boolean> {
    return this.repository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :ownerId', { ownerId })
      .andWhere(
        new Brackets((either) =>
          either
            .where('transaction.accountId = :accountId')
            .orWhere('transaction.destinationAccountId = :accountId'),
        ),
        { accountId },
      )
      .getExists();
  }

  async sumByTypeAndState(
    ownerId: number,
    range: DateRange,
  ): Promise<TransactionTotal[]> {
    const rows = await this.periodQuery(ownerId, range)
      .select('transaction.type', 'type')
      .addSelect('transaction.state', 'state')
      .addSelect('SUM(transaction.amount)::text', 'total')
      .andWhere('transaction.type IN (:...types)', {
        types: [TransactionType.INCOME, TransactionType.EXPENSE],
      })
      .groupBy('transaction.type')
      .addGroupBy('transaction.state')
      .getRawMany<TypeStateTotalRow>();

    return rows.map((row) => ({
      type: row.type,
      state: row.state,
      total: parseMoneyTotal(row.total),
    }));
  }

  async sumExpensesByCategory(
    ownerId: number,
    range: DateRange,
  ): Promise<CategoryExpenseTotal[]> {
    const rows = await this.periodQuery(ownerId, range)
      .select('transaction.categoryId', 'categoryId')
      .addSelect('transaction.state', 'state')
      .addSelect('SUM(transaction.amount)::text', 'total')
      .andWhere('transaction.type = :expense', {
        expense: TransactionType.EXPENSE,
      })
      .groupBy('transaction.categoryId')
      .addGroupBy('transaction.state')
      .getRawMany<CategoryTotalRow>();

    if (rows.length === 0) {
      return [];
    }

    const categories = await this.repository.manager
      .getRepository(TransactionCategoryOrmEntity)
      .find({
        where: { id: In(rows.map((row) => Number(row.categoryId))) },
        withDeleted: true,
      });

    const byId = new Map(
      categories.map((row) => [
        row.id,
        TransactionCategoryMapper.toDomain(row),
      ]),
    );

    return rows.flatMap((row) => {
      const category = byId.get(Number(row.categoryId));

      return category
        ? [{ category, state: row.state, total: parseMoneyTotal(row.total) }]
        : [];
    });
  }

  async create(transaction: TransactionEntity): Promise<TransactionEntity> {
    return this.saveAndReload(transaction);
  }

  async update(transaction: TransactionEntity): Promise<TransactionEntity> {
    return this.saveAndReload(transaction);
  }

  async softDelete(transaction: TransactionEntity): Promise<void> {
    await this.repository.softDelete({ id: transaction.id });
  }

  private ownerQuery(
    ownerId: number,
  ): SelectQueryBuilder<TransactionOrmEntity> {
    return this.repository
      .createQueryBuilder('transaction')
      .withDeleted()
      .innerJoinAndSelect('transaction.account', 'account')
      .leftJoinAndSelect('transaction.destinationAccount', 'destinationAccount')
      .leftJoinAndSelect('transaction.category', 'category')
      .where('transaction.userId = :ownerId', { ownerId })
      .andWhere('transaction.deletedAt IS NULL');
  }

  private balanceQuery(
    ownerId: number,
    filter: BalanceChangeFilter,
  ): SelectQueryBuilder<TransactionOrmEntity> {
    const qb = this.repository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :ownerId', { ownerId })
      .andWhere('transaction.state = :state', { state: filter.state });

    if (filter.until) {
      qb.andWhere('transaction.date <= :until', { until: filter.until });
    }

    return qb;
  }

  private periodQuery(
    ownerId: number,
    range: DateRange,
  ): SelectQueryBuilder<TransactionOrmEntity> {
    return this.repository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :ownerId', { ownerId })
      .andWhere('transaction.state IN (:...states)', { states: COUNTED_STATES })
      .andWhere('transaction.date BETWEEN :from AND :to', range);
  }

  private async saveAndReload(
    transaction: TransactionEntity,
  ): Promise<TransactionEntity> {
    const saved = await this.repository.save(
      TransactionMapper.toOrm(transaction),
    );

    const reloaded = await this.ownerQuery(transaction.ownerId)
      .andWhere('transaction.id = :id', { id: saved.id })
      .getOneOrFail();

    return TransactionMapper.toDomain(reloaded);
  }
}
