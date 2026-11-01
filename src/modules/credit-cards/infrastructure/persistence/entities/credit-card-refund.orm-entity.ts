import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseOrmEntity } from '@shared/infrastructure/persistence/base.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { CreditCardInvoiceOrmEntity } from './credit-card-invoice.orm-entity';
import { CreditCardPurchaseOrmEntity } from './credit-card-purchase.orm-entity';

@Entity('credit_card_refunds')
@Check('chk_credit_card_refunds_amount_positive', `"amount" > 0`)
@Index('idx_credit_card_refunds_purchase_id', ['purchaseId'])
@Index('idx_credit_card_refunds_invoice_id', ['invoiceId'])
@Index('idx_credit_card_refunds_user_id_date', ['userId', 'date'])
export class CreditCardRefundOrmEntity extends BaseOrmEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: false,
    comment: 'Owner of the refund; same as the owner of its purchase.',
  })
  userId!: number;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: UserOrmEntity;

  @Column({
    name: 'purchase_id',
    type: 'int',
    nullable: false,
    comment: 'Purchase being refunded, fully or partially.',
  })
  purchaseId!: number;

  @ManyToOne(
    () => CreditCardPurchaseOrmEntity,
    (purchase) => purchase.refunds,
    {
      nullable: false,
    },
  )
  @JoinColumn({ name: 'purchase_id' })
  purchase?: CreditCardPurchaseOrmEntity;

  @Column({
    name: 'invoice_id',
    type: 'int',
    nullable: false,
    comment: 'Invoice the refund is credited on, chosen by its date.',
  })
  invoiceId!: number;

  @ManyToOne(() => CreditCardInvoiceOrmEntity, { nullable: false })
  @JoinColumn({ name: 'invoice_id' })
  invoice?: CreditCardInvoiceOrmEntity;

  @Column({
    name: 'amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: false,
    comment:
      'Credited amount in BRL; refunds of a purchase never exceed its amount.',
  })
  amount!: string;

  @Column({
    name: 'date',
    type: 'date',
    nullable: false,
    comment: 'Date the refund was credited; on or after the purchase date.',
  })
  date!: string;

  @Column({
    name: 'notes',
    type: 'varchar',
    length: 1000,
    nullable: true,
    comment: 'Optional free-text notes.',
  })
  notes!: string | null;
}
