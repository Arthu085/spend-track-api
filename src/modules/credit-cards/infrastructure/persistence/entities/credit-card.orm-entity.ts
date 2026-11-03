import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseOrmEntity } from '@shared/infrastructure/persistence/base.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';

@Entity('credit_cards')
@Check('chk_credit_cards_credit_limit', `"credit_limit" >= 0`)
@Check('chk_credit_cards_closing_day', `"closing_day" BETWEEN 1 AND 31`)
@Check('chk_credit_cards_due_day', `"due_day" BETWEEN 1 AND 31`)
@Index('idx_credit_cards_user_id', ['userId'])
@Index('uq_credit_cards_default_per_user', ['userId'], {
  unique: true,
  where: '"is_default" = true AND "deleted_at" IS NULL',
})
export class CreditCardOrmEntity extends BaseOrmEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: false,
    comment: 'Owner of the card; only this user can read or change it.',
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
    comment: 'Card name chosen by the owner.',
  })
  name!: string;

  @Column({
    name: 'credit_limit',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: false,
    comment: 'Credit limit in BRL; informational, never blocks a purchase.',
  })
  creditLimit!: string;

  @Column({
    name: 'closing_day',
    type: 'smallint',
    nullable: false,
    comment:
      'Day of month the invoice closes (clamped to short months); purchases from this day on go to the next invoice.',
  })
  closingDay!: number;

  @Column({
    name: 'due_day',
    type: 'smallint',
    nullable: false,
    comment:
      'Day of month the invoice is due (clamped to short months); names the invoice month.',
  })
  dueDay!: number;

  @Column({
    name: 'is_default',
    type: 'boolean',
    nullable: false,
    default: false,
    comment: 'Preselected for new purchases; at most one live card per user.',
  })
  isDefault!: boolean;
}
