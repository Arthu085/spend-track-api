import { Column, Entity, Index } from 'typeorm';
import { AuditOutcome } from '@shared/domain/enums/audit-outcome.enum';
import { BaseTechnicalOrmEntity } from '@shared/infrastructure/persistence/base-technical.orm-entity';

@Entity('audit_logs')
@Index('idx_audit_logs_created_at', ['createdAt'])
@Index('idx_audit_logs_user_id', ['userId'])
@Index('idx_audit_logs_action', ['action'])
@Index('idx_audit_logs_outcome', ['outcome'])
export class AuditLogOrmEntity extends BaseTechnicalOrmEntity {
  @Column({
    name: 'user_id',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment:
      'Authenticated actor id (JWT subject), null when unauthenticated or unavailable.',
  })
  userId!: string | null;

  @Column({
    name: 'action',
    type: 'varchar',
    length: 120,
    nullable: false,
    comment:
      'Audited action identifier declared via endpoint().audit(...), e.g. "User.update".',
  })
  action!: string;

  @Column({
    name: 'method',
    type: 'varchar',
    length: 10,
    nullable: false,
    comment: 'HTTP method of the audited request.',
  })
  method!: string;

  @Column({
    name: 'path',
    type: 'text',
    nullable: false,
    comment: 'HTTP path of the audited request.',
  })
  path!: string;

  @Column({
    name: 'outcome',
    type: 'enum',
    enum: AuditOutcome,
    nullable: false,
    comment: 'Whether the audited request succeeded or failed.',
  })
  outcome!: AuditOutcome;

  @Column({
    name: 'status_code',
    type: 'int',
    nullable: false,
    comment: 'Resulting HTTP status code.',
  })
  statusCode!: number;

  @Column({
    name: 'context',
    type: 'jsonb',
    nullable: true,
    comment: 'Request metadata (ip, user agent, request id).',
  })
  context!: Record<string, unknown> | null;

  @Column({
    name: 'error_message',
    type: 'text',
    nullable: true,
    comment:
      'Error message when outcome is FAILURE; never a stack trace or sensitive data.',
  })
  errorMessage!: string | null;
}
