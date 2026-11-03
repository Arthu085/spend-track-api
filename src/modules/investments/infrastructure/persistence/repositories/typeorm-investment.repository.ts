import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import {
  BaseTransactionalRepository,
  applyExactFilter,
  applyILikeFilter,
} from '@shared/infrastructure/persistence';
import { InvestmentEntity } from '../../../domain/entities/investment.entity';
import type {
  InvestmentListFilters,
  InvestmentRepository,
  PaginatedInvestments,
} from '../../../domain/repositories/investment.repository';
import { InvestmentOrmEntity } from '../entities/investment.orm-entity';
import { InvestmentMapper } from '../mappers/investment.mapper';

const OWNER_INVESTMENTS_LOCK_NAMESPACE = 672504;

@Injectable()
export class TypeOrmInvestmentRepository
  extends BaseTransactionalRepository<InvestmentOrmEntity>
  implements InvestmentRepository
{
  constructor(
    @InjectRepository(InvestmentOrmEntity)
    repository: Repository<InvestmentOrmEntity>,
  ) {
    super(repository);
  }

  async findAllPaginatedByOwner(
    ownerId: number,
    offset: number,
    limit: number,
    filters: InvestmentListFilters = {},
  ): Promise<PaginatedInvestments> {
    const [rows, total] = await this.ownerQuery(ownerId, filters)
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { items: rows.map((row) => InvestmentMapper.toDomain(row)), total };
  }

  async findAllByOwner(
    ownerId: number,
    filters: InvestmentListFilters = {},
  ): Promise<InvestmentEntity[]> {
    const rows = await this.ownerQuery(ownerId, filters).getMany();

    return rows.map((row) => InvestmentMapper.toDomain(row));
  }

  async findByUuidForOwner(
    uuid: string,
    ownerId: number,
  ): Promise<InvestmentEntity | null> {
    const row = await this.repository.findOne({
      where: { uuid, userId: ownerId },
    });

    return row ? InvestmentMapper.toDomain(row) : null;
  }

  async lockOwnerInvestments(ownerId: number): Promise<void> {
    await this.repository.query('SELECT pg_advisory_xact_lock($1, $2)', [
      OWNER_INVESTMENTS_LOCK_NAMESPACE,
      ownerId,
    ]);
  }

  async create(investment: InvestmentEntity): Promise<InvestmentEntity> {
    return this.saveAndReload(investment);
  }

  async update(investment: InvestmentEntity): Promise<InvestmentEntity> {
    return this.saveAndReload(investment);
  }

  async softDelete(investment: InvestmentEntity): Promise<void> {
    await this.repository.softDelete({ id: investment.id });
  }

  private ownerQuery(
    ownerId: number,
    filters: InvestmentListFilters,
  ): SelectQueryBuilder<InvestmentOrmEntity> {
    const qb = this.repository
      .createQueryBuilder('investment')
      .where('investment.userId = :ownerId', { ownerId })
      .orderBy('investment.name', 'ASC')
      .addOrderBy('investment.id', 'ASC');

    applyILikeFilter(qb, 'investment.name', 'name', filters.name);
    applyExactFilter(qb, 'investment.type', 'type', filters.type);
    applyExactFilter(qb, 'investment.status', 'status', filters.status);

    return qb;
  }

  private async saveAndReload(
    investment: InvestmentEntity,
  ): Promise<InvestmentEntity> {
    const saved = await this.repository.save(
      InvestmentMapper.toOrm(investment),
    );

    return InvestmentMapper.toDomain(
      await this.repository.findOneOrFail({ where: { id: saved.id } }),
    );
  }
}
