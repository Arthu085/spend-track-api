import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  BaseTransactionalRepository,
  applyExactFilter,
} from '@shared/infrastructure/persistence';
import { CategoryEntity } from '../../../domain/entities/category.entity';
import { CategoryScope } from '../../../domain/enums/category-scope.enum';
import type {
  CategoryListFilters,
  CategoryRepository,
  PaginatedCategories,
} from '../../../domain/repositories/category.repository';
import { CategoryOrmEntity } from '../entities/category.orm-entity';
import { CategoryMapper } from '../mappers/category.mapper';

@Injectable()
export class TypeOrmCategoryRepository
  extends BaseTransactionalRepository<CategoryOrmEntity>
  implements CategoryRepository
{
  constructor(
    @InjectRepository(CategoryOrmEntity)
    repository: Repository<CategoryOrmEntity>,
  ) {
    super(repository);
  }

  async findAllPaginatedVisibleTo(
    ownerId: number,
    offset: number,
    limit: number,
    filters: CategoryListFilters = {},
  ): Promise<PaginatedCategories> {
    const qb = this.repository
      .createQueryBuilder('category')
      .orderBy('category.kind', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .addOrderBy('category.id', 'ASC')
      .skip(offset)
      .take(limit);

    if (filters.scope === CategoryScope.GLOBAL) {
      qb.where('category.userId IS NULL');
    } else if (filters.scope === CategoryScope.PERSONAL) {
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

    return { items: rows.map((row) => CategoryMapper.toDomain(row)), total };
  }

  async findVisibleByUuid(
    uuid: string,
    ownerId: number,
  ): Promise<CategoryEntity | null> {
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

    return row ? CategoryMapper.toDomain(row) : null;
  }

  async create(category: CategoryEntity): Promise<CategoryEntity> {
    return this.saveAndReload(category);
  }

  async update(category: CategoryEntity): Promise<CategoryEntity> {
    return this.saveAndReload(category);
  }

  async softDelete(category: CategoryEntity): Promise<void> {
    await this.repository.softDelete({ id: category.id });
  }

  private async saveAndReload(
    category: CategoryEntity,
  ): Promise<CategoryEntity> {
    const saved = await this.repository.save(CategoryMapper.toOrm(category));

    return CategoryMapper.toDomain(
      await this.repository.findOneOrFail({ where: { id: saved.id } }),
    );
  }
}
