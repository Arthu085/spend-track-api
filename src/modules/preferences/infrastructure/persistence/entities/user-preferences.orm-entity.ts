import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';
import { BaseTechnicalOrmEntity } from '@shared/infrastructure/persistence/base-technical.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';
import { DefaultMonth } from '@modules/preferences/domain/enums/default-month.enum';
import { SpendingPerspective } from '@modules/preferences/domain/enums/spending-perspective.enum';

export const USER_PREFERENCES_USER_UNIQUE = 'uq_user_preferences_user_id';

@Entity('user_preferences')
@Index(USER_PREFERENCES_USER_UNIQUE, ['userId'], { unique: true })
export class UserPreferencesOrmEntity extends BaseTechnicalOrmEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: false,
    comment: 'Owner of these preferences; one row per user.',
  })
  userId!: number;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: UserOrmEntity;

  @Column({
    name: 'spending_perspective',
    type: 'enum',
    enum: SpendingPerspective,
    nullable: false,
    default: SpendingPerspective.PURCHASE_DATE,
    comment:
      'Month a card purchase counts in: its purchase date or its invoice month.',
  })
  spendingPerspective!: SpendingPerspective;

  @Column({
    name: 'default_month',
    type: 'enum',
    enum: DefaultMonth,
    nullable: false,
    default: DefaultMonth.CURRENT,
    comment: 'Month the dashboard opens on: the current or the next one.',
  })
  defaultMonth!: DefaultMonth;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    nullable: false,
    comment: 'Timestamp when the preferences were last saved.',
  })
  updatedAt!: Date;
}
