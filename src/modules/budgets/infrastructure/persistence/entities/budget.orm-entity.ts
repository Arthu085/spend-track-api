import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';
import { BaseTechnicalOrmEntity } from '@shared/infrastructure/persistence/base-technical.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { BudgetCategoryLimitOrmEntity } from './budget-category-limit.orm-entity';

@Entity('budgets')
@Index('uq_budgets_user_id_month', ['userId', 'month'], { unique: true })
@Check('chk_budgets_month_first_day', `EXTRACT(DAY FROM "month") = 1`)
@Check(
  'chk_budgets_total_limit_positive',
  `"total_limit" IS NULL OR "total_limit" > 0`,
)
export class BudgetOrmEntity extends BaseTechnicalOrmEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: false,
    comment: 'Owner of the budget; only this user can read or change it.',
  })
  userId!: number;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: UserOrmEntity;

  @Column({
    name: 'month',
    type: 'date',
    nullable: false,
    comment: 'First day of the month the budget applies to; one per user.',
  })
  month!: string;

  @Column({
    name: 'total_limit',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    comment:
      'Overall spending limit in BRL for the month; null when only category limits are set.',
  })
  totalLimit!: string | null;

  @OneToMany(() => BudgetCategoryLimitOrmEntity, (limit) => limit.budget)
  categoryLimits?: BudgetCategoryLimitOrmEntity[];

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    nullable: false,
    comment: 'Timestamp when the budget was last saved.',
  })
  updatedAt!: Date;
}
