import {
  Column,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
} from 'typeorm';
import { BaseTechnicalOrmEntity } from '@shared/infrastructure/persistence/base-technical.orm-entity';
import { RoleOrmEntity } from '@modules/authorization/infrastructure/persistence/entities/role.orm-entity';
import { UserChangeRequestStatus } from '../../../domain/enums/user-change-request-status.enum';
import { UserOrmEntity } from './user.orm-entity';

@Entity('user_change_requests')
@Index('uq_user_change_requests_pending_target', ['targetUserId'], {
  unique: true,
  where: `"status" = 'PENDING'`,
})
export class UserChangeRequestOrmEntity extends BaseTechnicalOrmEntity {
  @Column({
    name: 'target_user_id',
    type: 'int',
    nullable: false,
    comment: 'Admin whose profile the request changes and who must approve it.',
  })
  targetUserId!: number;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'target_user_id' })
  targetUser!: UserOrmEntity;

  @Column({
    name: 'requested_by',
    type: 'int',
    nullable: true,
    comment: 'Admin who requested the change; null once that user is removed.',
  })
  requestedBy!: number | null;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'requested_by' })
  requester?: UserOrmEntity | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: UserChangeRequestStatus,
    nullable: false,
    comment:
      'PENDING until the target approves or rejects it, or a newer request supersedes it.',
  })
  status!: UserChangeRequestStatus;

  @Column({
    name: 'current_name',
    type: 'varchar',
    length: 150,
    nullable: false,
    comment: 'Target name when the request was made.',
  })
  currentName!: string;

  @Column({
    name: 'current_email',
    type: 'varchar',
    length: 255,
    nullable: false,
    comment: 'Target email when the request was made.',
  })
  currentEmail!: string;

  @Column({
    name: 'requested_name',
    type: 'varchar',
    length: 150,
    nullable: false,
    comment: 'Name applied on approval.',
  })
  requestedName!: string;

  @Column({
    name: 'requested_email',
    type: 'varchar',
    length: 255,
    nullable: false,
    comment: 'Normalized email applied on approval.',
  })
  requestedEmail!: string;

  @Column({
    name: 'expires_at',
    type: 'timestamptz',
    nullable: false,
    comment: 'When this request can no longer be approved.',
  })
  expiresAt!: Date;

  @Column({
    name: 'decided_at',
    type: 'timestamptz',
    nullable: true,
    comment: 'When the request left PENDING, if ever.',
  })
  decidedAt!: Date | null;

  @ManyToMany(() => RoleOrmEntity)
  @JoinTable({
    name: 'user_change_request_current_roles',
    joinColumn: { name: 'change_request_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  currentRoles!: RoleOrmEntity[];

  @ManyToMany(() => RoleOrmEntity)
  @JoinTable({
    name: 'user_change_request_requested_roles',
    joinColumn: { name: 'change_request_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  requestedRoles!: RoleOrmEntity[];
}
