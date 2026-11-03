import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseOrmEntity } from '@shared/infrastructure/persistence/base.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { AccountOrmEntity } from '@modules/accounts/infrastructure/persistence/entities/account.orm-entity';
import { TransactionState } from '@modules/transactions';
import { InvestmentMovementType } from '../../../domain/enums/investment-movement-type.enum';
import { InvestmentOrmEntity } from './investment.orm-entity';

@Entity('investment_movements')
@Check(
  'chk_investment_movements_amount',
  `("type" = 'VALUATION' AND "amount" <> 0) OR ("type" <> 'VALUATION' AND "amount" > 0)`,
)
@Check(
  'chk_investment_movements_account',
  `("type" = 'VALUATION') = ("account_id" IS NULL)`,
)
@Check(
  'chk_investment_movements_valuation_state',
  `"type" <> 'VALUATION' OR "state" <> 'PLANNED'`,
)
@Check(
  'chk_investment_movements_completed_on',
  `("state" = 'COMPLETED' AND "completed_on" IS NOT NULL) OR ("state" = 'PLANNED' AND "completed_on" IS NULL) OR "state" = 'CANCELED'`,
)
@Check(
  'chk_investment_movements_canceled_at',
  `("state" = 'CANCELED') = ("canceled_at" IS NOT NULL)`,
)
@Index('idx_investment_movements_user_id_date', ['userId', 'date'])
@Index('idx_investment_movements_investment_id', ['investmentId'])
@Index('idx_investment_movements_account_id', ['accountId'])
export class InvestmentMovementOrmEntity extends BaseOrmEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: false,
    comment:
      'Owner of the movement; same as the owner of the investment and account.',
  })
  userId!: number;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: UserOrmEntity;

  @Column({
    name: 'investment_id',
    type: 'int',
    nullable: false,
    comment: 'Investment, reserve, or goal the movement belongs to.',
  })
  investmentId!: number;

  @ManyToOne(() => InvestmentOrmEntity, { nullable: false })
  @JoinColumn({ name: 'investment_id' })
  investment?: InvestmentOrmEntity;

  @Column({
    name: 'type',
    type: 'enum',
    enum: InvestmentMovementType,
    nullable: false,
    comment:
      'Contribution from an account, withdrawal to an account, or manual valuation adjustment.',
  })
  type!: InvestmentMovementType;

  @Column({
    name: 'account_id',
    type: 'int',
    nullable: true,
    comment:
      'Account money leaves (contribution) or enters (withdrawal); null for valuations.',
  })
  accountId!: number | null;

  @ManyToOne(() => AccountOrmEntity, { nullable: true })
  @JoinColumn({ name: 'account_id' })
  account?: AccountOrmEntity | null;

  @Column({
    name: 'amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: false,
    comment:
      'Amount in BRL: strictly positive for contributions and withdrawals, the signed value change for valuations.',
  })
  amount!: string;

  @Column({
    name: 'date',
    type: 'date',
    nullable: false,
    comment:
      'Expected date of a planned movement, operation date of a completed one; months group by it.',
  })
  date!: string;

  @Column({
    name: 'state',
    type: 'enum',
    enum: TransactionState,
    nullable: false,
    comment:
      'PLANNED affects projections only, COMPLETED changes balances and value, CANCELED affects nothing.',
  })
  state!: TransactionState;

  @Column({
    name: 'completed_on',
    type: 'date',
    nullable: true,
    comment:
      'Effective date of a completed movement; kept when a completed movement is canceled.',
  })
  completedOn!: string | null;

  @Column({
    name: 'canceled_at',
    type: 'timestamptz',
    nullable: true,
    comment: 'Timestamp when the movement was canceled.',
  })
  canceledAt!: Date | null;
}
