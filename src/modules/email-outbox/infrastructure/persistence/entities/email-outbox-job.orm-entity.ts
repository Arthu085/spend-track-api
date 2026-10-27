import { Column, Entity, Index } from 'typeorm';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import { BaseTechnicalOrmEntity } from '@shared/infrastructure/persistence/base-technical.orm-entity';
import { EmailJobStatus } from '../../../domain/enums/email-job-status.enum';

@Entity('email_outbox')
@Index('idx_email_outbox_pending_available_at', ['availableAt'], {
  where: `"status" = 'PENDING'`,
})
@Index('idx_email_outbox_processing_locked_until', ['lockedUntil'], {
  where: `"status" = 'PROCESSING'`,
})
@Index('idx_email_outbox_processed_at', ['processedAt'], {
  where: `"processed_at" IS NOT NULL`,
})
export class EmailOutboxJobOrmEntity extends BaseTechnicalOrmEntity {
  @Column({
    name: 'email_type',
    type: 'enum',
    enum: EmailType,
    nullable: false,
    comment: 'Which email flow this delivery job belongs to.',
  })
  emailType!: EmailType;

  @Column({
    name: 'recipient',
    type: 'varchar',
    length: 320,
    nullable: false,
    comment:
      'Normalized recipient address. No token or link is stored: the handler mints it at delivery time.',
  })
  recipient!: string;

  @Column({
    name: 'locale',
    type: 'varchar',
    length: 16,
    nullable: false,
    comment: 'Language of the request that scheduled the email.',
  })
  locale!: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: EmailJobStatus,
    default: EmailJobStatus.PENDING,
    nullable: false,
    comment: 'Delivery state: PENDING, PROCESSING, SENT, or FAILED.',
  })
  status!: EmailJobStatus;

  @Column({
    name: 'attempts',
    type: 'int',
    default: 0,
    nullable: false,
    comment: 'Delivery attempts started so far; also the claim fencing token.',
  })
  attempts!: number;

  @Column({
    name: 'available_at',
    type: 'timestamptz',
    nullable: false,
    comment: 'Earliest time a PENDING job may be claimed (retry backoff).',
  })
  availableAt!: Date;

  @Column({
    name: 'locked_until',
    type: 'timestamptz',
    nullable: true,
    comment:
      'Lease expiry of a PROCESSING job; past it the job may be reclaimed.',
  })
  lockedUntil!: Date | null;

  @Column({
    name: 'processed_at',
    type: 'timestamptz',
    nullable: true,
    comment: 'When the job reached SENT or FAILED; drives retention.',
  })
  processedAt!: Date | null;

  @Column({
    name: 'last_error',
    type: 'varchar',
    length: 1000,
    nullable: true,
    comment: 'Last delivery error, with email addresses masked.',
  })
  lastError!: string | null;
}
