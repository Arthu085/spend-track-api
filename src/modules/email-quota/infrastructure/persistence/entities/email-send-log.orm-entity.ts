import { Column, Entity, Index } from 'typeorm';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import { BaseTechnicalOrmEntity } from '@shared/infrastructure/persistence/base-technical.orm-entity';

@Entity('email_send_logs')
@Index('idx_email_send_logs_type_recipient_created_at', [
  'emailType',
  'recipient',
  'createdAt',
])
export class EmailSendLogOrmEntity extends BaseTechnicalOrmEntity {
  @Column({
    name: 'email_type',
    type: 'enum',
    enum: EmailType,
    nullable: false,
    comment: 'Which email flow this send attempt belongs to.',
  })
  emailType!: EmailType;

  @Column({
    name: 'recipient',
    type: 'varchar',
    length: 320,
    nullable: false,
    comment:
      'Normalized (trimmed, lowercased) recipient address the quota is keyed on.',
  })
  recipient!: string;
}
