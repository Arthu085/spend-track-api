import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseTechnicalOrmEntity } from '@shared/infrastructure/persistence/base-technical.orm-entity';
import { TransactionCategoryOrmEntity } from '@modules/transaction-categories/infrastructure/persistence/entities/transaction-category.orm-entity';
import { BudgetOrmEntity } from './budget.orm-entity';

@Entity('budget_category_limits')
@Index(
  'uq_budget_category_limits_budget_id_category_id',
  ['budgetId', 'categoryId'],
  {
    unique: true,
  },
)
@Index('idx_budget_category_limits_category_id', ['categoryId'])
@Check('chk_budget_category_limits_amount_positive', `"amount" > 0`)
export class BudgetCategoryLimitOrmEntity extends BaseTechnicalOrmEntity {
  @Column({
    name: 'budget_id',
    type: 'int',
    nullable: false,
    comment: 'Monthly budget the limit belongs to.',
  })
  budgetId!: number;

  @ManyToOne(() => BudgetOrmEntity, (budget) => budget.categoryLimits, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'budget_id' })
  budget?: BudgetOrmEntity;

  @Column({
    name: 'category_id',
    type: 'int',
    nullable: false,
    comment: 'Global or personal expense category the limit applies to.',
  })
  categoryId!: number;

  @ManyToOne(() => TransactionCategoryOrmEntity, { nullable: false })
  @JoinColumn({ name: 'category_id' })
  category?: TransactionCategoryOrmEntity;

  @Column({
    name: 'amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: false,
    comment: 'Spending limit in BRL for the category in the month.',
  })
  amount!: string;
}
