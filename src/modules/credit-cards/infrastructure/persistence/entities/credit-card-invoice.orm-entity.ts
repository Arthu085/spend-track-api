import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseTechnicalOrmEntity } from '@shared/infrastructure/persistence/base-technical.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { CreditCardOrmEntity } from './credit-card.orm-entity';

@Entity('credit_card_invoices')
@Check(
  'chk_credit_card_invoices_reference_month',
  `EXTRACT(DAY FROM "reference_month") = 1`,
)
@Check('chk_credit_card_invoices_dates', `"closing_date" < "due_date"`)
@Index('idx_credit_card_invoices_user_id', ['userId'])
@Index(
  'uq_credit_card_invoices_card_reference_month',
  ['creditCardId', 'referenceMonth'],
  { unique: true },
)
export class CreditCardInvoiceOrmEntity extends BaseTechnicalOrmEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: false,
    comment: 'Owner of the invoice; same as the owner of its card.',
  })
  userId!: number;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: UserOrmEntity;

  @Column({
    name: 'credit_card_id',
    type: 'int',
    nullable: false,
    comment: 'Card the invoice belongs to.',
  })
  creditCardId!: number;

  @ManyToOne(() => CreditCardOrmEntity, { nullable: false })
  @JoinColumn({ name: 'credit_card_id' })
  creditCard?: CreditCardOrmEntity;

  @Column({
    name: 'reference_month',
    type: 'date',
    nullable: false,
    comment:
      'First day of the month the invoice is due in; the invoice month of the invoice-month perspective.',
  })
  referenceMonth!: string;

  @Column({
    name: 'closing_date',
    type: 'date',
    nullable: false,
    comment:
      'Snapshot of the closing date when the invoice was created; charges dated from this day on go to the next invoice.',
  })
  closingDate!: string;

  @Column({
    name: 'due_date',
    type: 'date',
    nullable: false,
    comment: 'Snapshot of the due date when the invoice was created.',
  })
  dueDate!: string;
}
