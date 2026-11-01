import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseTechnicalOrmEntity } from '@shared/infrastructure/persistence/base-technical.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { CreditCardInvoiceOrmEntity } from './credit-card-invoice.orm-entity';
import { CreditCardPurchaseOrmEntity } from './credit-card-purchase.orm-entity';

@Entity('credit_card_installments')
@Check('chk_credit_card_installments_amount_positive', `"amount" > 0`)
@Check('chk_credit_card_installments_number_positive', `"number" >= 1`)
@Index(
  'uq_credit_card_installments_purchase_number',
  ['purchaseId', 'number'],
  { unique: true },
)
@Index('idx_credit_card_installments_invoice_id', ['invoiceId'])
@Index('idx_credit_card_installments_user_id_date', ['userId', 'date'])
export class CreditCardInstallmentOrmEntity extends BaseTechnicalOrmEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: false,
    comment: 'Owner of the installment; same as the owner of its purchase.',
  })
  userId!: number;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: UserOrmEntity;

  @Column({
    name: 'purchase_id',
    type: 'int',
    nullable: false,
    comment: 'Purchase this installment belongs to.',
  })
  purchaseId!: number;

  @ManyToOne(
    () => CreditCardPurchaseOrmEntity,
    (purchase) => purchase.installments,
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
    comment: 'Invoice the installment is billed on.',
  })
  invoiceId!: number;

  @ManyToOne(() => CreditCardInvoiceOrmEntity, { nullable: false })
  @JoinColumn({ name: 'invoice_id' })
  invoice?: CreditCardInvoiceOrmEntity;

  @Column({
    name: 'number',
    type: 'smallint',
    nullable: false,
    comment: 'Position of the installment, starting at 1.',
  })
  number!: number;

  @Column({
    name: 'amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: false,
    comment:
      'Installment amount in BRL; the first one absorbs the rounding remainder.',
  })
  amount!: string;

  @Column({
    name: 'date',
    type: 'date',
    nullable: false,
    comment:
      'Purchase date shifted by number - 1 months; the month of the purchase-date perspective.',
  })
  date!: string;
}
