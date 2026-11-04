import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type SelectQueryBuilder } from 'typeorm';
import { CreditCardMapper } from '@modules/credit-cards/persistence';
import { SpendingPerspective } from '@modules/preferences';
import {
  TransactionCategoryMapper,
  TransactionCategoryOrmEntity,
} from '@modules/transaction-categories/persistence';
import { TransactionState } from '@modules/transactions';
import { parseMoneyTotal } from '@shared/domain/money';
import {
  BaseTransactionalRepository,
  applyExactFilter,
} from '@shared/infrastructure/persistence';
import { RecurrenceCardChargeEntity } from '../../../domain/entities/recurrence-card-charge.entity';
import type {
  OccurrenceListFilters,
  PaginatedRecurrenceCardCharges,
  PlannedCardChargeQuery,
  PlannedCardChargesDue,
  PlannedCardChargeTotal,
  RecurrenceCardChargeRepository,
} from '../../../domain/repositories/recurrence-card-charge.repository';
import { RecurrenceCardChargeOrmEntity } from '../entities/recurrence-card-charge.orm-entity';
import { RecurrenceCardChargeMapper } from '../mappers/recurrence-card-charge.mapper';

interface CategoryTotalRow {
  categoryId: number;
  total: string;
}

@Injectable()
export class TypeOrmRecurrenceCardChargeRepository
  extends BaseTransactionalRepository<RecurrenceCardChargeOrmEntity>
  implements RecurrenceCardChargeRepository
{
  constructor(
    @InjectRepository(RecurrenceCardChargeOrmEntity)
    repository: Repository<RecurrenceCardChargeOrmEntity>,
  ) {
    super(repository);
  }

  async findPaginatedByRecurrence(
    recurrenceId: number,
    offset: number,
    limit: number,
    filters: OccurrenceListFilters = {},
  ): Promise<PaginatedRecurrenceCardCharges> {
    const qb = this.recurrenceQuery(recurrenceId)
      .orderBy('charge.occurrenceDate', 'ASC')
      .addOrderBy('charge.id', 'ASC')
      .skip(offset)
      .take(limit);

    if (filters.from) {
      qb.andWhere('charge.occurrenceDate >= :from', { from: filters.from });
    }

    if (filters.to) {
      qb.andWhere('charge.occurrenceDate <= :to', { to: filters.to });
    }

    applyExactFilter(qb, 'charge.state', 'state', filters.state);

    const [rows, total] = await qb.getManyAndCount();

    return {
      items: rows.map((row) => RecurrenceCardChargeMapper.toDomain(row)),
      total,
    };
  }

  async findByUuidForRecurrence(
    uuid: string,
    recurrenceId: number,
  ): Promise<RecurrenceCardChargeEntity | null> {
    const row = await this.recurrenceQuery(recurrenceId)
      .andWhere('charge.uuid = :uuid', { uuid })
      .getOne();

    return row ? RecurrenceCardChargeMapper.toDomain(row) : null;
  }

  async findPlannedByRecurrence(
    recurrenceId: number,
    occurrenceFrom?: string,
  ): Promise<RecurrenceCardChargeEntity[]> {
    const qb = this.recurrenceQuery(recurrenceId)
      .andWhere('charge.state = :planned', {
        planned: TransactionState.PLANNED,
      })
      .orderBy('charge.occurrenceDate', 'ASC');

    if (occurrenceFrom) {
      qb.andWhere('charge.occurrenceDate >= :occurrenceFrom', {
        occurrenceFrom,
      });
    }

    const rows = await qb.getMany();

    return rows.map((row) => RecurrenceCardChargeMapper.toDomain(row));
  }

  async findOccurrenceDatesFrom(
    recurrenceId: number,
    from: string,
  ): Promise<string[]> {
    const rows = await this.repository
      .createQueryBuilder('charge')
      .select('CAST(charge.occurrenceDate AS text)', 'date')
      .where('charge.recurrenceId = :recurrenceId', { recurrenceId })
      .andWhere('charge.occurrenceDate >= :from', { from })
      .getRawMany<{ date: string }>();

    return rows.map(({ date }) => date);
  }

  async sumPlannedByCategory(
    ownerId: number,
    query: PlannedCardChargeQuery,
  ): Promise<PlannedCardChargeTotal[]> {
    const column =
      query.perspective === SpendingPerspective.INVOICE_MONTH
        ? 'charge.invoiceMonth'
        : 'charge.date';

    const rows = await this.repository
      .createQueryBuilder('charge')
      .select('charge.categoryId', 'categoryId')
      .addSelect('SUM(charge.amount)::text', 'total')
      .where('charge.userId = :ownerId', { ownerId })
      .andWhere('charge.state = :planned', {
        planned: TransactionState.PLANNED,
      })
      .andWhere(`${column} BETWEEN :from AND :to`, {
        from: query.from,
        to: query.to,
      })
      .groupBy('charge.categoryId')
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

      return category ? [{ category, total: parseMoneyTotal(row.total) }] : [];
    });
  }

  async findPlannedDueThrough(
    ownerId: number,
    invoiceMonth: string,
    limit: number,
  ): Promise<PlannedCardChargesDue> {
    const due = { ownerId, invoiceMonth, planned: TransactionState.PLANNED };

    const dueCondition =
      'charge.userId = :ownerId AND charge.state = :planned AND charge.invoiceMonth <= :invoiceMonth AND charge.deletedAt IS NULL';

    const [rows, count] = await this.repository
      .createQueryBuilder('charge')
      .withDeleted()
      .innerJoinAndSelect('charge.category', 'category')
      .innerJoinAndSelect('charge.recurrence', 'recurrence')
      .innerJoinAndSelect('recurrence.creditCard', 'card')
      .where(dueCondition, due)
      .orderBy('charge.date', 'ASC')
      .addOrderBy('charge.id', 'ASC')
      .take(limit)
      .getManyAndCount();

    const sum = await this.repository
      .createQueryBuilder('charge')
      .withDeleted()
      .select('COALESCE(SUM(charge.amount), 0)::text', 'total')
      .where(dueCondition, due)
      .getRawOne<{ total: string }>();

    return {
      items: rows.map((row) => ({
        charge: RecurrenceCardChargeMapper.toDomain(row),
        recurrenceUuid: row.recurrence!.uuid,
        card: CreditCardMapper.toDomain(row.recurrence!.creditCard!),
      })),
      count,
      total: parseMoneyTotal(sum?.total ?? '0'),
    };
  }

  async create(
    charge: RecurrenceCardChargeEntity,
  ): Promise<RecurrenceCardChargeEntity> {
    return this.saveAndReload(charge);
  }

  async update(
    charge: RecurrenceCardChargeEntity,
  ): Promise<RecurrenceCardChargeEntity> {
    return this.saveAndReload(charge);
  }

  async softDelete(charge: RecurrenceCardChargeEntity): Promise<void> {
    await this.repository.softDelete({ id: charge.id });
  }

  private recurrenceQuery(
    recurrenceId: number,
  ): SelectQueryBuilder<RecurrenceCardChargeOrmEntity> {
    return this.repository
      .createQueryBuilder('charge')
      .withDeleted()
      .innerJoinAndSelect('charge.category', 'category')
      .leftJoinAndSelect('charge.creditCardPurchase', 'purchase')
      .where('charge.recurrenceId = :recurrenceId', { recurrenceId })
      .andWhere('charge.deletedAt IS NULL');
  }

  private async saveAndReload(
    charge: RecurrenceCardChargeEntity,
  ): Promise<RecurrenceCardChargeEntity> {
    const saved = await this.repository.save(
      RecurrenceCardChargeMapper.toOrm(charge),
    );

    const reloaded = await this.recurrenceQuery(charge.recurrenceId)
      .andWhere('charge.id = :id', { id: saved.id })
      .getOneOrFail();

    return RecurrenceCardChargeMapper.toDomain(reloaded);
  }
}
