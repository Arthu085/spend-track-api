import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionCategoryMapper } from '@modules/transaction-categories/persistence';
import { formatMoney, parseMoney } from '@shared/domain/money';
import { BaseTransactionalRepository } from '@shared/infrastructure/persistence';
import type {
  BudgetRepository,
  BudgetValues,
  StoredBudget,
} from '../../../domain/repositories/budget.repository';
import { BudgetCategoryLimitOrmEntity } from '../entities/budget-category-limit.orm-entity';
import { BudgetOrmEntity } from '../entities/budget.orm-entity';

function toStored(orm: BudgetOrmEntity): StoredBudget {
  return {
    month: orm.month,
    totalLimit: orm.totalLimit === null ? null : parseMoney(orm.totalLimit),
    categoryLimits: (orm.categoryLimits ?? []).map((row) => {
      if (!row.category) {
        throw new Error('Budget category limit category must be loaded');
      }

      return {
        category: TransactionCategoryMapper.toDomain(row.category),
        limit: parseMoney(row.amount),
      };
    }),
    updatedAt: orm.updatedAt,
  };
}

@Injectable()
export class TypeOrmBudgetRepository
  extends BaseTransactionalRepository<BudgetOrmEntity>
  implements BudgetRepository
{
  constructor(
    @InjectRepository(BudgetOrmEntity)
    repository: Repository<BudgetOrmEntity>,
  ) {
    super(repository);
  }

  async findByMonth(
    ownerId: number,
    month: string,
  ): Promise<StoredBudget | null> {
    const row = await this.repository
      .createQueryBuilder('budget')
      .withDeleted()
      .leftJoinAndSelect('budget.categoryLimits', 'categoryLimit')
      .leftJoinAndSelect('categoryLimit.category', 'category')
      .where('budget.userId = :ownerId', { ownerId })
      .andWhere('budget.month = :month', { month })
      .orderBy('categoryLimit.id', 'ASC')
      .getOne();

    return row ? toStored(row) : null;
  }

  async save(
    ownerId: number,
    month: string,
    values: BudgetValues,
  ): Promise<StoredBudget> {
    await this.repository.upsert(
      {
        userId: ownerId,
        month,
        totalLimit:
          values.totalLimit === null ? null : formatMoney(values.totalLimit),
        updatedAt: new Date(),
      },
      {
        conflictPaths: ['userId', 'month'],
        skipUpdateIfNoValuesChanged: false,
      },
    );

    const budget = await this.repository.findOneOrFail({
      where: { userId: ownerId, month },
    });

    const limits = this.repository.manager.getRepository(
      BudgetCategoryLimitOrmEntity,
    );

    await limits.delete({ budgetId: budget.id });

    if (values.categoryLimits.length > 0) {
      await limits.insert(
        values.categoryLimits.map(({ category, limit }) => ({
          budgetId: budget.id,
          categoryId: category.id,
          amount: formatMoney(limit),
        })),
      );
    }

    const saved = await this.findByMonth(ownerId, month);

    if (!saved) {
      throw new Error('Saved budget must be readable');
    }

    return saved;
  }

  async delete(ownerId: number, month: string): Promise<boolean> {
    const result = await this.repository.delete({ userId: ownerId, month });

    return (result.affected ?? 0) > 0;
  }
}
