import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import { parseMoneyTotal } from '@shared/domain/money';
import { BaseTransactionalRepository } from '@shared/infrastructure/persistence';
import { CreditCardPaymentEntity } from '../../../domain/entities/credit-card-payment.entity';
import type { CreditCardPaymentRepository } from '../../../domain/repositories/credit-card-payment.repository';
import { CreditCardPaymentOrmEntity } from '../entities/credit-card-payment.orm-entity';
import { CreditCardPaymentMapper } from '../mappers/credit-card-payment.mapper';

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
      .groupBy('payment.accountId')
      .getRawMany<AccountTotalRow>();

    return new Map(
      rows.map((row) => [Number(row.accountId), parseMoneyTotal(row.total)]),
    );
  }

  async existsForAccount(ownerId: number, accountId: number): Promise<boolean> {
    return this.repository.exists({ where: { userId: ownerId, accountId } });
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
    const saved = await this.repository.save(
      CreditCardPaymentMapper.toOrm(payment),
    );

    return CreditCardPaymentMapper.toDomain(
      await this.paymentQuery()
        .where('payment.id = :id', { id: saved.id })
        .getOneOrFail(),
    );
  }
}
