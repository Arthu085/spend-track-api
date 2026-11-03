import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import { BaseTransactionalRepository } from '@shared/infrastructure/persistence';
import { CreditCardRefundEntity } from '../../../domain/entities/credit-card-refund.entity';
import type { CreditCardRefundRepository } from '../../../domain/repositories/credit-card-refund.repository';
import { CreditCardRefundOrmEntity } from '../entities/credit-card-refund.orm-entity';
import { CreditCardRefundMapper } from '../mappers/credit-card-refund.mapper';

@Injectable()
export class TypeOrmCreditCardRefundRepository
  extends BaseTransactionalRepository<CreditCardRefundOrmEntity>
  implements CreditCardRefundRepository
{
  constructor(
    @InjectRepository(CreditCardRefundOrmEntity)
    repository: Repository<CreditCardRefundOrmEntity>,
  ) {
    super(repository);
  }

  async findByUuidForPurchase(
    uuid: string,
    purchaseId: number,
  ): Promise<CreditCardRefundEntity | null> {
    const row = await this.refundQuery()
      .where('refund.uuid = :uuid', { uuid })
      .andWhere('refund.purchaseId = :purchaseId', { purchaseId })
      .andWhere('refund.deletedAt IS NULL')
      .getOne();

    return row ? CreditCardRefundMapper.toDomain(row) : null;
  }

  async create(
    refund: CreditCardRefundEntity,
  ): Promise<CreditCardRefundEntity> {
    const saved = await this.repository.save(
      CreditCardRefundMapper.toOrm(refund),
    );

    return CreditCardRefundMapper.toDomain(
      await this.refundQuery()
        .where('refund.id = :id', { id: saved.id })
        .getOneOrFail(),
    );
  }

  async softDelete(refund: CreditCardRefundEntity): Promise<void> {
    await this.repository.softDelete({ id: refund.id });
  }

  private refundQuery(): SelectQueryBuilder<CreditCardRefundOrmEntity> {
    return this.repository
      .createQueryBuilder('refund')
      .withDeleted()
      .innerJoinAndSelect('refund.purchase', 'purchase')
      .innerJoinAndSelect('refund.invoice', 'invoice')
      .innerJoinAndSelect('invoice.creditCard', 'card');
  }
}
