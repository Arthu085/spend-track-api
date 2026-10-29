import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseOrmEntity } from '@shared/infrastructure/persistence/base.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { TransactionCategoryKind } from '@modules/transaction-categories/domain/enums/transaction-category-kind.enum';

@Entity('transaction_categories')
@Check(
  'chk_transaction_categories_scope',
  `("user_id" IS NULL) = ("code" IS NOT NULL)`,
)
@Index('idx_transaction_categories_user_id', ['userId'])
@Index('uq_transaction_categories_code', ['code'], {
  unique: true,
  where: '"code" IS NOT NULL',
})
export class TransactionCategoryOrmEntity extends BaseOrmEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: true,
    comment:
      'Owner of a personal transaction category, visible only to them; null for global transaction categories.',
  })
  userId!: number | null;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: UserOrmEntity | null;

  @Column({
    name: 'code',
    type: 'varchar',
    length: 50,
    nullable: true,
    comment:
      'Stable catalog code of a global transaction category, used for its translated name; null for personal transaction categories.',
  })
  code!: string | null;

  @Column({
    name: 'name',
    type: 'varchar',
    length: 100,
    nullable: false,
    comment:
      'Name of a personal transaction category; fallback name of a global transaction category.',
  })
  name!: string;

  @Column({
    name: 'kind',
    type: 'enum',
    enum: TransactionCategoryKind,
    nullable: false,
    comment: 'Transaction type the category applies to.',
  })
  kind!: TransactionCategoryKind;

  @Column({
    name: 'color',
    type: 'varchar',
    length: 7,
    nullable: true,
    comment: 'Display color as #RRGGBB; null lets the client choose.',
  })
  color!: string | null;
}
