import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
} from 'typeorm';
import { BaseOrmEntity } from '@shared/infrastructure/persistence/base.orm-entity';
import { RoleOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/role.orm-entity';

export const USERS_EMAIL_UNIQUE_INDEX = 'uq_users_email_active';

@Entity('users')
@Check('chk_users_email_normalized', `"email" = lower(btrim("email"))`)
@Index(USERS_EMAIL_UNIQUE_INDEX, ['email'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class UserOrmEntity extends BaseOrmEntity {
  @Column({
    name: 'name',
    type: 'varchar',
    length: 150,
    nullable: false,
    comment: 'User full name.',
  })
  name!: string;

  @Column({
    name: 'email',
    type: 'varchar',
    length: 255,
    nullable: false,
    comment: 'Unique login email, stored normalized (trimmed, lowercased).',
  })
  email!: string;

  @Column({
    name: 'password',
    type: 'varchar',
    length: 255,
    nullable: false,
    comment: 'Argon2-hashed password.',
  })
  password!: string;

  @Column({
    name: 'email_confirmed_at',
    type: 'timestamptz',
    nullable: true,
    comment:
      'When the user confirmed ownership of their email; null until then.',
  })
  emailConfirmedAt!: Date | null;

  @Column({
    name: 'created_by',
    type: 'int',
    nullable: true,
    comment:
      'Id of the user who created this record; null for bootstrap/seeded records.',
  })
  createdBy!: number | null;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdByUser?: UserOrmEntity | null;

  @Column({
    name: 'updated_by',
    type: 'int',
    nullable: true,
    comment: 'Id of the user who last updated this record.',
  })
  updatedBy!: number | null;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'updated_by' })
  updatedByUser?: UserOrmEntity | null;

  @Column({
    name: 'deleted_by',
    type: 'int',
    nullable: true,
    comment:
      'Id of the user who soft-deleted this record; null while the record is active.',
  })
  deletedBy!: number | null;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'deleted_by' })
  deletedByUser?: UserOrmEntity | null;

  @ManyToMany(() => RoleOrmEntity)
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles!: RoleOrmEntity[];
}
