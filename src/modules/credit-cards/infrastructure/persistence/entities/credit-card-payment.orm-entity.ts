import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseOrmEntity } from '@shared/infrastructure/persistence/base.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { AccountOrmEntity } from '@modules/accounts/infrastructure/persistence/entities/account.orm-entity';
import { CreditCardInvoiceOrmEntity } from './credit-card-invoice.orm-entity';

@Entity('credit_card_payments')
@Check('chk_credit_card_payments_amount_positive', `"amount" > 0`)
@Index('idx_credit_card_payments_invoice_id', ['invoiceId'])
@Index('idx_credit_card_payments_account_id', ['accountId'])
@Index('idx_credit_card_payments_user_id', ['userId'])
export class CreditCardPaymentOrmEntity extends BaseOrmEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: false,
    comment:
      'Owner of the payment; same as the owner of the invoice and account.',
  })
  userId!: number;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: UserOrmEntity;

  @Column({
    name: 'invoice_id',
    type: 'int',
    nullable: false,
    comment: 'Invoice being paid, fully or partially.',
  })
  invoiceId!: number;

  @ManyToOne(() => CreditCardInvoiceOrmEntity, { nullable: false })
  @JoinColumn({ name: 'invoice_id' })
  invoice?: CreditCardInvoiceOrmEntity;

  @Column({
    name: 'account_id',
    type: 'int',
    nullable: false,
    comment: 'Account the money leaves; never counted as an expense.',
  })
  accountId!: number;

  @ManyToOne(() => AccountOrmEntity, { nullable: false })
  @JoinColumn({ name: 'account_id' })
  account?: AccountOrmEntity;

  @Column({
    name: 'amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: false,
    comment:
      'Paid amount in BRL; never more than the invoice outstanding when recorded.',
  })
  amount!: string;

  @Column({
    name: 'paid_on',
    type: 'date',
    nullable: false,
    comment: 'Date the payment left the account.',
  })
  paidOn!: string;

  @Column({
    name: 'canceled_at',
    type: 'timestamptz',
    nullable: true,
    comment:
      'Timestamp when the payment was canceled; a canceled payment affects neither the account nor the invoice.',
  })
  canceledAt!: Date | null;
}
