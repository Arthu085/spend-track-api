import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseTechnicalOrmEntity } from '@shared/infrastructure/persistence/base-technical.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';

@Entity('password_reset_tokens')
export class PasswordResetTokenOrmEntity extends BaseTechnicalOrmEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: false,
    comment: 'Owning user id.',
  })
  @Index('idx_password_reset_tokens_user_id')
  userId!: number;

  @ManyToOne(() => UserOrmEntity, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user!: UserOrmEntity;

  @Column({
    name: 'token_hash',
    type: 'varchar',
    length: 255,
    nullable: false,
    comment: 'SHA-256 hash of the password-reset token secret.',
  })
  tokenHash!: string;

  @Column({
    name: 'expires_at',
    type: 'timestamptz',
    nullable: false,
    comment: 'When this password-reset token stops being usable.',
  })
  @Index('idx_password_reset_tokens_expires_at')
  expiresAt!: Date;

  @Column({
    name: 'consumed_at',
    type: 'timestamptz',
    nullable: true,
    comment: 'When this password-reset token was consumed, if ever.',
  })
  consumedAt!: Date | null;
}
