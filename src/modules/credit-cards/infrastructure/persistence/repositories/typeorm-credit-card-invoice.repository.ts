import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import { TransactionCategoryMapper } from '@modules/transaction-categories/persistence';
import { parseMoney, parseMoneyTotal } from '@shared/domain/money';
import { BaseTransactionalRepository } from '@shared/infrastructure/persistence';
import type { InvoiceTotals } from '../../../domain/billing/invoice-statement';
import { CreditCardInvoiceEntity } from '../../../domain/entities/credit-card-invoice.entity';
import type {
  CreditCardInvoiceRepository,
  InvoiceCharge,
  InvoiceEntries,
  InvoiceTotalsFilter,
} from '../../../domain/repositories/credit-card-invoice.repository';
import { CreditCardInstallmentOrmEntity } from '../entities/credit-card-installment.orm-entity';
import { CreditCardInvoiceOrmEntity } from '../entities/credit-card-invoice.orm-entity';
import { CreditCardPaymentOrmEntity } from '../entities/credit-card-payment.orm-entity';
import { CreditCardRefundOrmEntity } from '../entities/credit-card-refund.orm-entity';
import { CreditCardInvoiceMapper } from '../mappers/credit-card-invoice.mapper';
import { CreditCardPaymentMapper } from '../mappers/credit-card-payment.mapper';
import { CreditCardRefundMapper } from '../mappers/credit-card-refund.mapper';

interface InvoiceTotalRow {
  invoiceId: number;
  total: string;
}

interface InstallmentCountRow {
  purchaseId: number;
  count: string;
}

@Injectable()
export class TypeOrmCreditCardInvoiceRepository
  extends BaseTransactionalRepository<CreditCardInvoiceOrmEntity>
  implements CreditCardInvoiceRepository
{
  constructor(
    @InjectRepository(CreditCardInvoiceOrmEntity)
    repository: Repository<CreditCardInvoiceOrmEntity>,
  ) {
    super(repository);
  }

  async findByUuidForOwner(
    uuid: string,
    ownerId: number,
  ): Promise<CreditCardInvoiceEntity | null> {
    const row = await this.invoiceQuery()
      .where('invoice.uuid = :uuid', { uuid })
      .andWhere('invoice.userId = :ownerId', { ownerId })
      .getOne();

    return row ? CreditCardInvoiceMapper.toDomain(row) : null;
  }

  async findByCardAndReferenceMonth(
    cardId: number,
    referenceMonth: string,
  ): Promise<CreditCardInvoiceEntity | null> {
    const row = await this.invoiceQuery()
      .where('invoice.creditCardId = :cardId', { cardId })
      .andWhere('invoice.referenceMonth = :referenceMonth', { referenceMonth })
      .getOne();

    return row ? CreditCardInvoiceMapper.toDomain(row) : null;
  }

  async findTotals(
    ownerId: number,
    filter: InvoiceTotalsFilter = {},
  ): Promise<InvoiceTotals[]> {
    const qb = this.invoiceQuery()
      .where('invoice.userId = :ownerId', { ownerId })
      .orderBy('invoice.referenceMonth', 'ASC')
      .addOrderBy('invoice.id', 'ASC');

    if (filter.cardIds) {
      qb.andWhere('invoice.creditCardId IN (:...cardIds)', {
        cardIds: filter.cardIds,
      });
    }

    const rows = await qb.getMany();

    if (rows.length === 0) {
      return [];
    }

    const invoiceIds = rows.map((row) => row.id);
    const charges = await this.chargeTotals(invoiceIds);
    const credits = await this.creditTotals(invoiceIds);
    const paid = await this.paidTotals(invoiceIds);

    return rows.map((row) => ({
      invoice: CreditCardInvoiceMapper.toDomain(row),
      charges: charges.get(row.id) ?? 0,
      credits: credits.get(row.id) ?? 0,
      paid: paid.get(row.id) ?? 0,
    }));
  }

  async findEntries(invoice: CreditCardInvoiceEntity): Promise<InvoiceEntries> {
    const manager = this.repository.manager;

    const installments = await manager
      .getRepository(CreditCardInstallmentOrmEntity)
      .createQueryBuilder('installment')
      .withDeleted()
      .innerJoinAndSelect('installment.purchase', 'purchase')
      .innerJoinAndSelect('purchase.category', 'category')
      .where('installment.invoiceId = :invoiceId', { invoiceId: invoice.id })
      .andWhere('purchase.deletedAt IS NULL')
      .orderBy('installment.date', 'ASC')
      .addOrderBy('installment.id', 'ASC')
      .getMany();

    const counts = await this.installmentCounts(
      installments.map((row) => row.purchaseId),
    );

    const refunds = await manager
      .getRepository(CreditCardRefundOrmEntity)
      .createQueryBuilder('refund')
      .withDeleted()
      .innerJoinAndSelect('refund.purchase', 'purchase')
      .innerJoinAndSelect('refund.invoice', 'invoice')
      .innerJoinAndSelect('invoice.creditCard', 'card')
      .where('refund.invoiceId = :invoiceId', { invoiceId: invoice.id })
      .andWhere('refund.deletedAt IS NULL')
      .orderBy('refund.date', 'ASC')
      .addOrderBy('refund.id', 'ASC')
      .getMany();

    const payments = await manager
      .getRepository(CreditCardPaymentOrmEntity)
      .createQueryBuilder('payment')
      .withDeleted()
      .innerJoinAndSelect('payment.account', 'account')
      .innerJoinAndSelect('payment.invoice', 'invoice')
      .innerJoinAndSelect('invoice.creditCard', 'card')
      .where('payment.invoiceId = :invoiceId', { invoiceId: invoice.id })
      .andWhere('payment.deletedAt IS NULL')
      .orderBy('payment.paidOn', 'ASC')
      .addOrderBy('payment.id', 'ASC')
      .getMany();

    return {
      charges: installments.map((row) => this.chargeOf(row, counts)),
      refunds: refunds.map((row) => CreditCardRefundMapper.toDomain(row)),
      payments: payments.map((row) => CreditCardPaymentMapper.toDomain(row)),
    };
  }

  async create(
    invoice: CreditCardInvoiceEntity,
  ): Promise<CreditCardInvoiceEntity> {
    const saved = await this.repository.save(
      CreditCardInvoiceMapper.toOrm(invoice),
    );

    return CreditCardInvoiceMapper.toDomain(
      await this.invoiceQuery()
        .where('invoice.id = :id', { id: saved.id })
        .getOneOrFail(),
    );
  }

  private invoiceQuery(): SelectQueryBuilder<CreditCardInvoiceOrmEntity> {
    return this.repository
      .createQueryBuilder('invoice')
      .withDeleted()
      .innerJoinAndSelect('invoice.creditCard', 'card');
  }

  private chargeOf(
    row: CreditCardInstallmentOrmEntity,
    counts: Map<number, number>,
  ): InvoiceCharge {
    if (!row.purchase?.category) {
      throw new Error('Installment purchase relation must be loaded');
    }

    return {
      purchaseUuid: row.purchase.uuid,
      description: row.purchase.description,
      category: TransactionCategoryMapper.toDomain(row.purchase.category),
      purchaseDate: row.purchase.purchaseDate,
      installmentNumber: row.number,
      installmentCount: counts.get(row.purchaseId) ?? 1,
      amount: parseMoney(row.amount),
      date: row.date,
    };
  }

  private async installmentCounts(
    purchaseIds: readonly number[],
  ): Promise<Map<number, number>> {
    if (purchaseIds.length === 0) {
      return new Map();
    }

    const rows = await this.repository.manager
      .getRepository(CreditCardInstallmentOrmEntity)
      .createQueryBuilder('installment')
      .select('installment.purchaseId', 'purchaseId')
      .addSelect('COUNT(*)::text', 'count')
      .where('installment.purchaseId IN (:...purchaseIds)', {
        purchaseIds: [...new Set(purchaseIds)],
      })
      .groupBy('installment.purchaseId')
      .getRawMany<InstallmentCountRow>();

    return new Map(
      rows.map((row) => [Number(row.purchaseId), Number(row.count)]),
    );
  }

  private async chargeTotals(
    invoiceIds: readonly number[],
  ): Promise<Map<number, number>> {
    const rows = await this.repository.manager
      .getRepository(CreditCardInstallmentOrmEntity)
      .createQueryBuilder('installment')
      .withDeleted()
      .innerJoin('installment.purchase', 'purchase')
      .select('installment.invoiceId', 'invoiceId')
      .addSelect('SUM(installment.amount)::text', 'total')
      .where('installment.invoiceId IN (:...invoiceIds)', { invoiceIds })
      .andWhere('purchase.deletedAt IS NULL')
      .groupBy('installment.invoiceId')
      .getRawMany<InvoiceTotalRow>();

    return this.totalsById(rows);
  }

  private async creditTotals(
    invoiceIds: readonly number[],
  ): Promise<Map<number, number>> {
    const rows = await this.repository.manager
      .getRepository(CreditCardRefundOrmEntity)
      .createQueryBuilder('refund')
      .select('refund.invoiceId', 'invoiceId')
      .addSelect('SUM(refund.amount)::text', 'total')
      .where('refund.invoiceId IN (:...invoiceIds)', { invoiceIds })
      .groupBy('refund.invoiceId')
      .getRawMany<InvoiceTotalRow>();

    return this.totalsById(rows);
  }

  private async paidTotals(
    invoiceIds: readonly number[],
  ): Promise<Map<number, number>> {
    const rows = await this.repository.manager
      .getRepository(CreditCardPaymentOrmEntity)
      .createQueryBuilder('payment')
      .select('payment.invoiceId', 'invoiceId')
      .addSelect('SUM(payment.amount)::text', 'total')
      .where('payment.invoiceId IN (:...invoiceIds)', { invoiceIds })
      .andWhere('payment.canceledAt IS NULL')
      .groupBy('payment.invoiceId')
      .getRawMany<InvoiceTotalRow>();

    return this.totalsById(rows);
  }

  private totalsById(rows: readonly InvoiceTotalRow[]): Map<number, number> {
    return new Map(
      rows.map((row) => [Number(row.invoiceId), parseMoneyTotal(row.total)]),
    );
  }
}
