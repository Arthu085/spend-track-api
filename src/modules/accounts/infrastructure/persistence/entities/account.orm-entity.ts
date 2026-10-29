import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseOrmEntity } from '@shared/infrastructure/persistence/base.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { AccountType } from '@modules/accounts/domain/enums/account-type.enum';

export const ACCOUNTS_DEFAULT_UNIQUE_INDEX = 'uq_accounts_default_per_user';

@Entity('accounts')
@Index('idx_accounts_user_id', ['userId'])
@Index(ACCOUNTS_DEFAULT_UNIQUE_INDEX, ['userId'], {
  unique: true,
  where: '"is_default" = true AND "deleted_at" IS NULL',
})
export class AccountOrmEntity extends BaseOrmEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: false,
    comment: 'Owner of the account; only this user can read or change it.',
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
    comment: 'Account name chosen by the owner.',
  })
  name!: string;

  @Column({
    name: 'type',
    type: 'enum',
    enum: AccountType,
    nullable: false,
    comment: 'Kind of account: checking, savings, cash/wallet, or other.',
  })
  type!: AccountType;

  @Column({
    name: 'opening_balance',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: false,
    default: 0,
    comment: 'Balance in BRL on opening_balance_date, before any transaction.',
  })
  openingBalance!: string;

  @Column({
    name: 'opening_balance_date',
    type: 'date',
    nullable: false,
    comment: 'Date the opening balance refers to.',
  })
  openingBalanceDate!: string;

  @Column({
    name: 'is_default',
    type: 'boolean',
    nullable: false,
    default: false,
    comment:
      'Preselected for new transactions; at most one live account per user.',
  })
  isDefault!: boolean;
}
