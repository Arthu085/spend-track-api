import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import { parseMoneyTotal } from '@shared/domain/money';
import {
  BaseTransactionalRepository,
  isUniqueViolation,
} from '@shared/infrastructure/persistence';
import { CreditCardPaymentEntity } from '../../../domain/entities/credit-card-payment.entity';
import { CreditCardPaymentSource } from '../../../domain/enums/credit-card-payment-source.enum';
import { CreditCardHistoricalSettlementDuplicateError } from '../../../domain/errors/credit-card-historical-settlement-duplicate.error';
import type { CreditCardPaymentRepository } from '../../../domain/repositories/credit-card-payment.repository';
import { CreditCardPaymentOrmEntity } from '../entities/credit-card-payment.orm-entity';
import { CreditCardPaymentMapper } from '../mappers/credit-card-payment.mapper';

const HISTORICAL_SETTLEMENT_UNIQUE_INDEX =
  'uq_credit_card_payments_historical_settlement';

interface AccountTotalRow {
  accountId: number;
  total: string;
}

@Injectable()
export class TypeOrmCreditCardPaymentRepository
  extends BaseTransactionalRepository<CreditCardPaymentOrmEntity>
  implements CreditCardPaymentRepository
{
  constructor(
    @InjectRepository(CreditCardPaymentOrmEntity)
    repository: Repository<CreditCardPaymentOrmEntity>,
  ) {
    super(repository);
  }

  async findByUuidForInvoice(
    uuid: string,
    invoiceId: number,
  ): Promise<CreditCardPaymentEntity | null> {
    const row = await this.paymentQuery()
      .where('payment.uuid = :uuid', { uuid })
      .andWhere('payment.invoiceId = :invoiceId', { invoiceId })
      .andWhere('payment.deletedAt IS NULL')
      .getOne();

    return row ? CreditCardPaymentMapper.toDomain(row) : null;
  }

  async sumByAccount(
    ownerId: number,
    accountIds: readonly number[],
  ): Promise<Map<number, number>> {
    if (accountIds.length === 0) {
      return new Map();
    }

    const rows = await this.repository
      .createQueryBuilder('payment')
      .select('payment.accountId', 'accountId')
      .addSelect('SUM(payment.amount)::text', 'total')
      .where('payment.userId = :ownerId', { ownerId })
      .andWhere('payment.accountId IN (:...accountIds)', { accountIds })
      .andWhere('payment.canceledAt IS NULL')
      .andWhere('payment.source = :source', {
        source: CreditCardPaymentSource.ACCOUNT,
      })
      .groupBy('payment.accountId')
      .getRawMany<AccountTotalRow>();

    return new Map(
      rows.map((row) => [Number(row.accountId), parseMoneyTotal(row.total)]),
    );
  }

  async existsForAccount(ownerId: number, accountId: number): Promise<boolean> {
    return this.repository.exists({ where: { userId: ownerId, accountId } });
  }

  async findEarliestDateForAccount(
    ownerId: number,
    accountId: number,
  ): Promise<string | null> {
    const row = await this.repository
      .createQueryBuilder('payment')
      .select('MIN(payment.paidOn)::text', 'earliest')
      .where('payment.userId = :ownerId', { ownerId })
      .andWhere('payment.accountId = :accountId', { accountId })
      .andWhere('payment.canceledAt IS NULL')
      .andWhere('payment.source = :source', {
        source: CreditCardPaymentSource.ACCOUNT,
      })
      .getRawOne<{ earliest: string | null }>();

    return row?.earliest ?? null;
  }

  async findLatestHistoricalDateForAccount(
    ownerId: number,
    accountId: number,
  ): Promise<string | null> {
    const row = await this.repository
      .createQueryBuilder('payment')
      .select('MAX(payment.paidOn)::text', 'latest')
      .where('payment.userId = :ownerId', { ownerId })
      .andWhere('payment.accountId = :accountId', { accountId })
      .andWhere('payment.canceledAt IS NULL')
      .andWhere('payment.source = :source', {
        source: CreditCardPaymentSource.HISTORICAL_SETTLEMENT,
      })
      .getRawOne<{ latest: string | null }>();

    return row?.latest ?? null;
  }

  async create(
    payment: CreditCardPaymentEntity,
  ): Promise<CreditCardPaymentEntity> {
    return this.saveAndReload(payment);
  }

  async update(
    payment: CreditCardPaymentEntity,
  ): Promise<CreditCardPaymentEntity> {
    return this.saveAndReload(payment);
  }

  private paymentQuery(): SelectQueryBuilder<CreditCardPaymentOrmEntity> {
    return this.repository
      .createQueryBuilder('payment')
      .withDeleted()
      .innerJoinAndSelect('payment.account', 'account')
      .innerJoinAndSelect('payment.invoice', 'invoice')
      .innerJoinAndSelect('invoice.creditCard', 'card');
  }

  private async saveAndReload(
    payment: CreditCardPaymentEntity,
  ): Promise<CreditCardPaymentEntity> {
    const saved = await this.saveWithDuplicateMapping(payment);

    return CreditCardPaymentMapper.toDomain(
      await this.paymentQuery()
        .where('payment.id = :id', { id: saved.id })
        .getOneOrFail(),
    );
  }

  private async saveWithDuplicateMapping(
    payment: CreditCardPaymentEntity,
  ): Promise<CreditCardPaymentOrmEntity> {
    try {
      return await this.repository.save(CreditCardPaymentMapper.toOrm(payment));
    } catch (error) {
      if (isUniqueViolation(error, HISTORICAL_SETTLEMENT_UNIQUE_INDEX)) {
        throw new CreditCardHistoricalSettlementDuplicateError();
      }

      throw error;
    }
  }
}
