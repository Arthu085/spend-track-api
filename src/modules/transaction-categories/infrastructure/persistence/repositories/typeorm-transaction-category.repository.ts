import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  BaseTransactionalRepository,
  applyExactFilter,
} from '@shared/infrastructure/persistence';
import { TransactionCategoryEntity } from '../../../domain/entities/transaction-category.entity';
import { TransactionCategoryScope } from '../../../domain/enums/transaction-category-scope.enum';
import type {
  TransactionCategoryListFilters,
  TransactionCategoryRepository,
  PaginatedTransactionCategories,
} from '../../../domain/repositories/transaction-category.repository';
import { TransactionCategoryOrmEntity } from '../entities/transaction-category.orm-entity';
import { TransactionCategoryMapper } from '../mappers/transaction-category.mapper';

@Injectable()
export class TypeOrmTransactionCategoryRepository
  extends BaseTransactionalRepository<TransactionCategoryOrmEntity>
  implements TransactionCategoryRepository
{
  constructor(
    @InjectRepository(TransactionCategoryOrmEntity)
    repository: Repository<TransactionCategoryOrmEntity>,
  ) {
    super(repository);
  }

  async findAllPaginatedVisibleTo(
    ownerId: number,
    offset: number,
    limit: number,
    filters: TransactionCategoryListFilters = {},
  ): Promise<PaginatedTransactionCategories> {
    const qb = this.repository
      .createQueryBuilder('category')
      .orderBy('category.kind', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .addOrderBy('category.id', 'ASC')
      .skip(offset)
      .take(limit);

    if (filters.scope === TransactionCategoryScope.GLOBAL) {
      qb.where('category.userId IS NULL');
    } else if (filters.scope === TransactionCategoryScope.PERSONAL) {
      qb.where('category.userId = :ownerId', { ownerId });
    } else {
      qb.where(
        new Brackets((visible) =>
          visible
            .where('category.userId IS NULL')
            .orWhere('category.userId = :ownerId', { ownerId }),
        ),
      );
    }

    applyExactFilter(qb, 'category.kind', 'kind', filters.kind);
    applyExactFilter(qb, 'category.status', 'status', filters.status);

    const [rows, total] = await qb.getManyAndCount();

    return {
      items: rows.map((row) => TransactionCategoryMapper.toDomain(row)),
      total,
    };
  }

  async findVisibleByUuid(
    uuid: string,
    ownerId: number,
  ): Promise<TransactionCategoryEntity | null> {
    const row = await this.repository
      .createQueryBuilder('category')
      .where('category.uuid = :uuid', { uuid })
      .andWhere(
        new Brackets((visible) =>
          visible
            .where('category.userId IS NULL')
            .orWhere('category.userId = :ownerId', { ownerId }),
        ),
      )
      .getOne();

    return row ? TransactionCategoryMapper.toDomain(row) : null;
  }

  async create(
    category: TransactionCategoryEntity,
  ): Promise<TransactionCategoryEntity> {
    return this.saveAndReload(category);
  }

  async update(
    category: TransactionCategoryEntity,
  ): Promise<TransactionCategoryEntity> {
    return this.saveAndReload(category);
  }

  async softDelete(category: TransactionCategoryEntity): Promise<void> {
    await this.repository.softDelete({ id: category.id });
  }

  private async saveAndReload(
    category: TransactionCategoryEntity,
  ): Promise<TransactionCategoryEntity> {
    const saved = await this.repository.save(
      TransactionCategoryMapper.toOrm(category),
    );

    return TransactionCategoryMapper.toDomain(
      await this.repository.findOneOrFail({ where: { id: saved.id } }),
    );
  }
}
