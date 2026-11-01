import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type SelectQueryBuilder } from 'typeorm';
import { SpendingPerspective } from '@modules/preferences';
import {
  TransactionCategoryMapper,
  TransactionCategoryOrmEntity,
} from '@modules/transaction-categories/persistence';
import { parseMoneyTotal, sumMoney } from '@shared/domain/money';
import {
  BaseTransactionalRepository,
  applyExactFilter,
  applyILikeFilter,
} from '@shared/infrastructure/persistence';
import { CreditCardPurchaseEntity } from '../../../domain/entities/credit-card-purchase.entity';
import type {
  CategorySpendingTotal,
  CreditCardPurchaseListFilters,
  CreditCardPurchaseRepository,
  CreditCardSpendingQuery,
  PaginatedCreditCardPurchases,
} from '../../../domain/repositories/credit-card-purchase.repository';
import { CreditCardInstallmentOrmEntity } from '../entities/credit-card-installment.orm-entity';
import { CreditCardPurchaseOrmEntity } from '../entities/credit-card-purchase.orm-entity';
import { CreditCardRefundOrmEntity } from '../entities/credit-card-refund.orm-entity';
import { CreditCardPurchaseMapper } from '../mappers/credit-card-purchase.mapper';

interface CategoryTotalRow {
  categoryId: number;
  total: string;
}

@Injectable()
export class TypeOrmCreditCardPurchaseRepository
  extends BaseTransactionalRepository<CreditCardPurchaseOrmEntity>
  implements CreditCardPurchaseRepository
{
  constructor(
    @InjectRepository(CreditCardPurchaseOrmEntity)
    repository: Repository<CreditCardPurchaseOrmEntity>,
  ) {
    super(repository);
  }

  async findAllPaginatedByOwner(
    ownerId: number,
    offset: number,
    limit: number,
    filters: CreditCardPurchaseListFilters = {},
  ): Promise<PaginatedCreditCardPurchases> {
    const qb = this.ownerQuery(ownerId)
      .orderBy('purchase.purchaseDate', 'DESC')
      .addOrderBy('purchase.id', 'DESC')
      .skip(offset)
      .take(limit);

    if (filters.from) {
      qb.andWhere('purchase.purchaseDate >= :from', { from: filters.from });
    }

    if (filters.to) {
      qb.andWhere('purchase.purchaseDate <= :to', { to: filters.to });
    }

    applyExactFilter(qb, 'card.uuid', 'cardUuid', filters.cardUuid);
    applyExactFilter(qb, 'category.uuid', 'categoryUuid', filters.categoryUuid);
    applyILikeFilter(
      qb,
      'purchase.description',
      'description',
      filters.description,
    );

    const [rows, total] = await qb.getManyAndCount();

    return {
      items: rows.map((row) => CreditCardPurchaseMapper.toDomain(row)),
      total,
    };
  }

  async findByUuidForOwner(
    uuid: string,
    ownerId: number,
  ): Promise<CreditCardPurchaseEntity | null> {
    const row = await this.ownerQuery(ownerId)
      .andWhere('purchase.uuid = :uuid', { uuid })
      .getOne();

    return row ? CreditCardPurchaseMapper.toDomain(row) : null;
  }

  async sumSpendingByCategory(
    ownerId: number,
    query: CreditCardSpendingQuery,
  ): Promise<CategorySpendingTotal[]> {
    const byInvoiceMonth =
      query.perspective === SpendingPerspective.INVOICE_MONTH;

    const range = { from: query.from, to: query.to };

    const charges = this.repository.manager
      .getRepository(CreditCardInstallmentOrmEntity)
      .createQueryBuilder('entry')
      .withDeleted()
      .innerJoin('entry.purchase', 'purchase')
      .select('purchase.categoryId', 'categoryId')
      .addSelect('SUM(entry.amount)::text', 'total')
      .where('entry.userId = :ownerId', { ownerId })
      .andWhere('purchase.deletedAt IS NULL');

    const credits = this.repository.manager
      .getRepository(CreditCardRefundOrmEntity)
      .createQueryBuilder('entry')
      .withDeleted()
      .innerJoin('entry.purchase', 'purchase')
      .select('purchase.categoryId', 'categoryId')
      .addSelect('SUM(-entry.amount)::text', 'total')
      .where('entry.userId = :ownerId', { ownerId })
      .andWhere('entry.deletedAt IS NULL')
      .andWhere('purchase.deletedAt IS NULL');

    const rows = [
      ...(await this.inPeriod(charges, byInvoiceMonth, range)),
      ...(await this.inPeriod(credits, byInvoiceMonth, range)),
    ];

    return this.withCategories(rows);
  }

  async create(
    purchase: CreditCardPurchaseEntity,
  ): Promise<CreditCardPurchaseEntity> {
    return this.saveAndReload(purchase);
  }

  async update(
    purchase: CreditCardPurchaseEntity,
  ): Promise<CreditCardPurchaseEntity> {
    return this.saveAndReload(purchase);
  }

  async softDelete(purchase: CreditCardPurchaseEntity): Promise<void> {
    await this.repository.softDelete({ id: purchase.id });
  }

  private ownerQuery(
    ownerId: number,
  ): SelectQueryBuilder<CreditCardPurchaseOrmEntity> {
    return this.repository
      .createQueryBuilder('purchase')
      .withDeleted()
      .innerJoinAndSelect('purchase.creditCard', 'card')
      .innerJoinAndSelect('purchase.category', 'category')
      .innerJoinAndSelect('purchase.installments', 'installment')
      .innerJoinAndSelect('installment.invoice', 'installmentInvoice')
      .leftJoinAndSelect('purchase.refunds', 'refund')
      .leftJoinAndSelect('refund.invoice', 'refundInvoice')
      .where('purchase.userId = :ownerId', { ownerId })
      .andWhere('purchase.deletedAt IS NULL');
  }

  private inPeriod<
    T extends CreditCardInstallmentOrmEntity | CreditCardRefundOrmEntity,
  >(
    qb: SelectQueryBuilder<T>,
    byInvoiceMonth: boolean,
    range: { from: string; to: string },
  ): Promise<CategoryTotalRow[]> {
    if (byInvoiceMonth) {
      qb.innerJoin('entry.invoice', 'invoice').andWhere(
        'invoice.referenceMonth BETWEEN :from AND :to',
        range,
      );
    } else {
      qb.andWhere('entry.date BETWEEN :from AND :to', range);
    }

    return qb.groupBy('purchase.categoryId').getRawMany<CategoryTotalRow>();
  }

  private async withCategories(
    rows: readonly CategoryTotalRow[],
  ): Promise<CategorySpendingTotal[]> {
    if (rows.length === 0) {
      return [];
    }

    const totals = new Map<number, number[]>();

    for (const row of rows) {
      const categoryId = Number(row.categoryId);

      totals.set(categoryId, [
        ...(totals.get(categoryId) ?? []),
        parseMoneyTotal(row.total),
      ]);
    }

    const categories = await this.repository.manager
      .getRepository(TransactionCategoryOrmEntity)
      .find({ where: { id: In([...totals.keys()]) }, withDeleted: true });

    return categories.map((category) => ({
      category: TransactionCategoryMapper.toDomain(category),
      total: sumMoney(totals.get(category.id) ?? []),
    }));
  }

  private async saveAndReload(
    purchase: CreditCardPurchaseEntity,
  ): Promise<CreditCardPurchaseEntity> {
    const saved = await this.repository.save(
      CreditCardPurchaseMapper.toOrm(purchase),
    );

    const reloaded = await this.ownerQuery(purchase.ownerId)
      .andWhere('purchase.id = :id', { id: saved.id })
      .getOneOrFail();

    return CreditCardPurchaseMapper.toDomain(reloaded);
  }
}
