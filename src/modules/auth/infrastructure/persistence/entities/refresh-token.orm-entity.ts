import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseTechnicalOrmEntity } from '@shared/infrastructure/persistence/base-technical.orm-entity';
import { UserOrmEntity } from '@modules/users/infrastructure/persistence/entities/user.orm-entity';

@Entity('refresh_tokens')
export class RefreshTokenOrmEntity extends BaseTechnicalOrmEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: false,
    comment: 'Owning user id.',
  })
  @Index('idx_refresh_tokens_user_id')
  userId!: number;

  @ManyToOne(() => UserOrmEntity, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user!: UserOrmEntity;

  @Column({
    name: 'session_id',
    type: 'uuid',
    nullable: false,
    comment:
      'Session id (sid claim) shared by every token rotated from one login.',
  })
  @Index('idx_refresh_tokens_session_id')
  sessionId!: string;

  @Column({
    name: 'token_hash',
    type: 'varchar',
    length: 255,
    nullable: false,
    comment: 'SHA-256 hash of the signed refresh token.',
  })
  tokenHash!: string;

  @Column({
    name: 'expires_at',
    type: 'timestamptz',
    nullable: false,
    comment: 'When this refresh token stops being usable.',
  })
  @Index('idx_refresh_tokens_expires_at')
  expiresAt!: Date;

  @Column({
    name: 'revoked_at',
    type: 'timestamptz',
    nullable: true,
    comment: 'When this refresh token was revoked (rotation or logout).',
  })
  revokedAt!: Date | null;

  @Column({
    name: 'replaced_by_uuid',
    type: 'uuid',
    nullable: true,
    comment: 'uuid of the refresh token row that replaced this one, if any.',
  })
  replacedByUuid!: string | null;
}
