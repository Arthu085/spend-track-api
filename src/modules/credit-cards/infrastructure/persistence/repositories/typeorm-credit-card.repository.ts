import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BaseTransactionalRepository,
  applyExactFilter,
  applyILikeFilter,
} from '@shared/infrastructure/persistence';
import { CreditCardEntity } from '../../../domain/entities/credit-card.entity';
import type {
  CreditCardListFilters,
  CreditCardRepository,
  PaginatedCreditCards,
} from '../../../domain/repositories/credit-card.repository';
import { CreditCardPurchaseOrmEntity } from '../entities/credit-card-purchase.orm-entity';
import { CreditCardOrmEntity } from '../entities/credit-card.orm-entity';
import { CreditCardMapper } from '../mappers/credit-card.mapper';

const OWNER_CARDS_LOCK_NAMESPACE = 672503;

@Injectable()
export class TypeOrmCreditCardRepository
  extends BaseTransactionalRepository<CreditCardOrmEntity>
  implements CreditCardRepository
{
  constructor(
    @InjectRepository(CreditCardOrmEntity)
    repository: Repository<CreditCardOrmEntity>,
  ) {
    super(repository);
  }

  async findAllPaginatedByOwner(
    ownerId: number,
    offset: number,
    limit: number,
    filters: CreditCardListFilters = {},
  ): Promise<PaginatedCreditCards> {
    const qb = this.repository
      .createQueryBuilder('card')
      .where('card.userId = :ownerId', { ownerId })
      .orderBy('card.isDefault', 'DESC')
      .addOrderBy('card.name', 'ASC')
      .addOrderBy('card.id', 'ASC')
      .skip(offset)
      .take(limit);

    applyILikeFilter(qb, 'card.name', 'name', filters.name);
    applyExactFilter(qb, 'card.status', 'status', filters.status);

    const [rows, total] = await qb.getManyAndCount();

    return { items: rows.map((row) => CreditCardMapper.toDomain(row)), total };
  }

  async findByUuidForOwner(
    uuid: string,
    ownerId: number,
  ): Promise<CreditCardEntity | null> {
    const row = await this.repository.findOne({
      where: { uuid, userId: ownerId },
    });

    return row ? CreditCardMapper.toDomain(row) : null;
  }

  async hasPurchases(ownerId: number, cardId: number): Promise<boolean> {
    return this.repository.manager
      .getRepository(CreditCardPurchaseOrmEntity)
      .exists({ where: { userId: ownerId, creditCardId: cardId } });
  }

  async lockOwnerCards(ownerId: number): Promise<void> {
    await this.repository.query('SELECT pg_advisory_xact_lock($1, $2)', [
      OWNER_CARDS_LOCK_NAMESPACE,
      ownerId,
    ]);
  }

  async clearDefault(ownerId: number): Promise<void> {
    await this.repository.update(
      { userId: ownerId, isDefault: true },
      { isDefault: false },
    );
  }

  async create(card: CreditCardEntity): Promise<CreditCardEntity> {
    return this.saveAndReload(card);
  }

  async update(card: CreditCardEntity): Promise<CreditCardEntity> {
    return this.saveAndReload(card);
  }

  async softDelete(card: CreditCardEntity): Promise<void> {
    await this.repository.update(
      { id: card.id },
      { isDefault: false, deletedAt: new Date() },
    );
  }

  private async saveAndReload(
    card: CreditCardEntity,
  ): Promise<CreditCardEntity> {
    const saved = await this.repository.save(CreditCardMapper.toOrm(card));

    return CreditCardMapper.toDomain(
      await this.repository.findOneOrFail({ where: { id: saved.id } }),
    );
  }
}
