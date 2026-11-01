import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseOrmEntity } from '@shared/infrastructure/persistence/base.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { TransactionCategoryOrmEntity } from '@modules/transaction-categories/infrastructure/persistence/entities/transaction-category.orm-entity';
import { CreditCardOrmEntity } from './credit-card.orm-entity';
import { CreditCardInstallmentOrmEntity } from './credit-card-installment.orm-entity';
import { CreditCardRefundOrmEntity } from './credit-card-refund.orm-entity';

@Entity('credit_card_purchases')
@Check('chk_credit_card_purchases_amount_positive', `"amount" > 0`)
@Index('idx_credit_card_purchases_user_id_purchase_date', [
  'userId',
  'purchaseDate',
])
@Index('idx_credit_card_purchases_credit_card_id', ['creditCardId'])
@Index('idx_credit_card_purchases_category_id', ['categoryId'])
export class CreditCardPurchaseOrmEntity extends BaseOrmEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: false,
    comment: 'Owner of the purchase; only this user can read or change it.',
  })
  userId!: number;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: UserOrmEntity;

  @Column({
    name: 'credit_card_id',
    type: 'int',
    nullable: false,
    comment: 'Card the purchase was made with; owned by user_id.',
  })
  creditCardId!: number;

  @ManyToOne(() => CreditCardOrmEntity, { nullable: false })
  @JoinColumn({ name: 'credit_card_id' })
  creditCard?: CreditCardOrmEntity;

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
    comment: 'Original total in BRL; its installments add up to it.',
  })
  amount!: string;

  @Column({
    name: 'purchase_date',
    type: 'date',
    nullable: false,
    comment: 'Date of the purchase; never changed by the spending perspective.',
  })
  purchaseDate!: string;

  @Column({
    name: 'notes',
    type: 'varchar',
    length: 1000,
    nullable: true,
    comment: 'Optional free-text notes.',
  })
  notes!: string | null;

  @OneToMany(
    () => CreditCardInstallmentOrmEntity,
    (installment) => installment.purchase,
    { cascade: ['insert'] },
  )
  installments?: CreditCardInstallmentOrmEntity[];

  @OneToMany(() => CreditCardRefundOrmEntity, (refund) => refund.purchase)
  refunds?: CreditCardRefundOrmEntity[];
}
