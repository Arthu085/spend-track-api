import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseOrmEntity } from '@shared/infrastructure/persistence/base.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { CategoryKind } from '@modules/categories/domain/enums/category-kind.enum';

@Entity('categories')
@Check('chk_categories_scope', `("user_id" IS NULL) = ("code" IS NOT NULL)`)
@Index('idx_categories_user_id', ['userId'])
@Index('uq_categories_code', ['code'], {
  unique: true,
  where: '"code" IS NOT NULL',
})
export class CategoryOrmEntity extends BaseOrmEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: true,
    comment:
      'Owner of a personal category, visible only to them; null for global categories.',
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
      'Stable catalog code of a global category, used for its translated name; null for personal categories.',
  })
  code!: string | null;

  @Column({
    name: 'name',
    type: 'varchar',
    length: 100,
    nullable: false,
    comment: 'Name of a personal category; fallback name of a global category.',
  })
  name!: string;

  @Column({
    name: 'kind',
    type: 'enum',
    enum: CategoryKind,
    nullable: false,
    comment: 'Transaction type the category applies to.',
  })
  kind!: CategoryKind;

  @Column({
    name: 'color',
    type: 'varchar',
    length: 7,
    nullable: true,
    comment: 'Display color as #RRGGBB; null lets the client choose.',
  })
  color!: string | null;
}
