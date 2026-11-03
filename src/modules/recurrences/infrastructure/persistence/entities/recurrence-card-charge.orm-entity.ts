import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseOrmEntity } from '@shared/infrastructure/persistence/base.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { CreditCardPurchaseOrmEntity } from '@modules/credit-cards/infrastructure/persistence/entities/credit-card-purchase.orm-entity';
import { TransactionCategoryOrmEntity } from '@modules/transaction-categories/infrastructure/persistence/entities/transaction-category.orm-entity';
import { TransactionState } from '@modules/transactions/domain/enums/transaction-state.enum';
import { RecurrenceOrmEntity } from './recurrence.orm-entity';

@Entity('recurrence_card_charges')
@Check('chk_recurrence_card_charges_amount_positive', `"amount" > 0`)
@Check(
  'chk_recurrence_card_charges_purchase',
  `("state" = 'COMPLETED') = ("credit_card_purchase_id" IS NOT NULL)`,
)
@Check(
  'chk_recurrence_card_charges_canceled_at',
  `("state" = 'CANCELED') = ("canceled_at" IS NOT NULL)`,
)
@Index(
  'uq_recurrence_card_charges_occurrence',
  ['recurrenceId', 'occurrenceDate'],
  { unique: true, where: '"deleted_at" IS NULL' },
)
@Index('idx_recurrence_card_charges_user_id_state', ['userId', 'state'])
@Index('idx_recurrence_card_charges_category_id', ['categoryId'])
@Index('idx_recurrence_card_charges_credit_card_purchase_id', [
  'creditCardPurchaseId',
])
export class RecurrenceCardChargeOrmEntity extends BaseOrmEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: false,
    comment: 'Owner of the charge; same as the owner of its recurrence.',
  })
  userId!: number;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: UserOrmEntity;

  @Column({
    name: 'recurrence_id',
    type: 'int',
    nullable: false,
    comment: 'Card recurrence that generated the charge.',
  })
  recurrenceId!: number;

  @ManyToOne(() => RecurrenceOrmEntity, { nullable: false })
  @JoinColumn({ name: 'recurrence_id' })
  recurrence?: RecurrenceOrmEntity;

  @Column({
    name: 'occurrence_date',
    type: 'date',
    nullable: false,
    comment: 'Scheduled date in the recurrence; never changes.',
  })
  occurrenceDate!: string;

  @Column({
    name: 'date',
    type: 'date',
    nullable: false,
    comment:
      'Expected charge date while planned, purchase date once confirmed; months group by it in the purchase-date perspective.',
  })
  date!: string;

  @Column({
    name: 'description',
    type: 'varchar',
    length: 150,
    nullable: false,
    comment: 'Description of the charge.',
  })
  description!: string;

  @Column({
    name: 'amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: false,
    comment: 'Expected amount while planned, confirmed amount once completed.',
  })
  amount!: string;

  @Column({
    name: 'category_id',
    type: 'int',
    nullable: false,
    comment: 'Global or personal expense category.',
  })
  categoryId!: number;

  @ManyToOne(() => TransactionCategoryOrmEntity, { nullable: false })
  @JoinColumn({ name: 'category_id' })
  category?: TransactionCategoryOrmEntity;

  @Column({
    name: 'invoice_month',
    type: 'date',
    nullable: false,
    comment:
      'Reference month (first day) of the invoice the charge is expected on, or is on once confirmed.',
  })
  invoiceMonth!: string;

  @Column({
    name: 'state',
    type: 'enum',
    enum: TransactionState,
    nullable: false,
    comment:
      'PLANNED is a projection only, COMPLETED became a purchase, CANCELED was skipped.',
  })
  state!: TransactionState;

  @Column({
    name: 'canceled_at',
    type: 'timestamptz',
    nullable: true,
    comment: 'Timestamp when the charge was skipped.',
  })
  canceledAt!: Date | null;

  @Column({
    name: 'credit_card_purchase_id',
    type: 'int',
    nullable: true,
    comment: 'Purchase created when the charge was confirmed.',
  })
  creditCardPurchaseId!: number | null;

  @ManyToOne(() => CreditCardPurchaseOrmEntity, { nullable: true })
  @JoinColumn({ name: 'credit_card_purchase_id' })
  creditCardPurchase?: CreditCardPurchaseOrmEntity | null;
}
