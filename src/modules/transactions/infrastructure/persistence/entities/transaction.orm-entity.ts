import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseOrmEntity } from '@shared/infrastructure/persistence/base.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { AccountOrmEntity } from '@modules/accounts/infrastructure/persistence/entities/account.orm-entity';
import { TransactionCategoryOrmEntity } from '@modules/transaction-categories/infrastructure/persistence/entities/transaction-category.orm-entity';
import { TransactionState } from '@modules/transactions/domain/enums/transaction-state.enum';
import { TransactionType } from '@modules/transactions/domain/enums/transaction-type.enum';

@Entity('transactions')
@Check('chk_transactions_amount_positive', `"amount" > 0`)
@Check(
  'chk_transactions_destination_account',
  `("type" = 'TRANSFER') = ("destination_account_id" IS NOT NULL) AND ("destination_account_id" IS NULL OR "destination_account_id" <> "account_id")`,
)
@Check(
  'chk_transactions_category',
  `("type" = 'TRANSFER') = ("category_id" IS NULL)`,
)
@Check(
  'chk_transactions_completed_on',
  `("state" = 'COMPLETED' AND "completed_on" IS NOT NULL) OR ("state" = 'PLANNED' AND "completed_on" IS NULL) OR "state" = 'CANCELED'`,
)
@Check(
  'chk_transactions_canceled_at',
  `("state" = 'CANCELED') = ("canceled_at" IS NOT NULL)`,
)
@Index('idx_transactions_user_id_date', ['userId', 'date'])
@Index('idx_transactions_account_id', ['accountId'])
@Index('idx_transactions_destination_account_id', ['destinationAccountId'])
@Index('idx_transactions_category_id', ['categoryId'])
export class TransactionOrmEntity extends BaseOrmEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: false,
    comment: 'Owner of the transaction; only this user can read or change it.',
  })
  userId!: number;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: UserOrmEntity;

  @Column({
    name: 'type',
    type: 'enum',
    enum: TransactionType,
    nullable: false,
    comment:
      'Income, expense, or transfer between own accounts; fixed at creation.',
  })
  type!: TransactionType;

  @Column({
    name: 'description',
    type: 'varchar',
    length: 150,
    nullable: false,
    comment: 'Short description chosen by the owner.',
  })
  description!: string;

  @Column({
    name: 'amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: false,
    comment: 'Strictly positive amount in BRL; the type gives its direction.',
  })
  amount!: string;

  @Column({
    name: 'date',
    type: 'date',
    nullable: false,
    comment:
      'Due or expected date of a planned transaction, operation date of a completed one; months group by it.',
  })
  date!: string;

  @Column({
    name: 'state',
    type: 'enum',
    enum: TransactionState,
    nullable: false,
    comment:
      'PLANNED affects projections only, COMPLETED changes actual balances, CANCELED affects nothing.',
  })
  state!: TransactionState;

  @Column({
    name: 'completed_on',
    type: 'date',
    nullable: true,
    comment:
      'Effective payment or receipt date; set while completed, kept when a completed transaction is canceled.',
  })
  completedOn!: string | null;

  @Column({
    name: 'canceled_at',
    type: 'timestamptz',
    nullable: true,
    comment: 'Timestamp when the transaction was canceled.',
  })
  canceledAt!: Date | null;

  @Column({
    name: 'account_id',
    type: 'int',
    nullable: false,
    comment:
      'Account money leaves (expense, transfer) or enters (income); owned by user_id.',
  })
  accountId!: number;

  @ManyToOne(() => AccountOrmEntity, { nullable: false })
  @JoinColumn({ name: 'account_id' })
  account?: AccountOrmEntity;

  @Column({
    name: 'destination_account_id',
    type: 'int',
    nullable: true,
    comment: 'Account a transfer moves money into; null for other types.',
  })
  destinationAccountId!: number | null;

  @ManyToOne(() => AccountOrmEntity, { nullable: true })
  @JoinColumn({ name: 'destination_account_id' })
  destinationAccount?: AccountOrmEntity | null;

  @Column({
    name: 'category_id',
    type: 'int',
    nullable: true,
    comment:
      'Global or personal category whose kind matches the type; null for transfers.',
  })
  categoryId!: number | null;

  @ManyToOne(() => TransactionCategoryOrmEntity, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category?: TransactionCategoryOrmEntity | null;

  @Column({
    name: 'notes',
    type: 'varchar',
    length: 1000,
    nullable: true,
    comment: 'Optional free-text notes.',
  })
  notes!: string | null;
}
