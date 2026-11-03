import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseOrmEntity } from '@shared/infrastructure/persistence/base.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { InvestmentType } from '../../../domain/enums/investment-type.enum';

@Entity('investments')
@Check(
  'chk_investments_target_amount_positive',
  `"target_amount" IS NULL OR "target_amount" > 0`,
)
@Index('idx_investments_user_id', ['userId'])
export class InvestmentOrmEntity extends BaseOrmEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: false,
    comment: 'Owner of the investment; only this user can read or change it.',
  })
  userId!: number;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: UserOrmEntity;

  @Column({
    name: 'name',
    type: 'varchar',
    length: 100,
    nullable: false,
    comment: 'Investment, reserve, or goal name chosen by the owner.',
  })
  name!: string;

  @Column({
    name: 'type',
    type: 'enum',
    enum: InvestmentType,
    nullable: false,
    comment: 'Investment, reserve, or savings goal; display grouping only.',
  })
  type!: InvestmentType;

  @Column({
    name: 'target_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    comment:
      'Optional target value in BRL used to follow progress; null without a target.',
  })
  targetAmount!: string | null;
}
