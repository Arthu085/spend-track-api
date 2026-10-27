import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailType } from '@shared/domain/enums/email-type.enum';
import {
  BaseTransactionalRepository,
  deleteBatchBefore,
} from '@shared/infrastructure/persistence';
import { EmailJobStatus } from '../../../domain/enums/email-job-status.enum';
import type {
  ClaimedEmailJob,
  EmailOutboxRepository,
  EnqueueEmailJobInput,
} from '../../../domain/repositories/email-outbox.repository';
import { EmailOutboxJobOrmEntity } from '../entities/email-outbox-job.orm-entity';

interface ClaimedRow {
  id: number;
  uuid: string;
  email_type: EmailType;
  recipient: string;
  locale: string;
  attempts: number;
}

@Injectable()
export class TypeOrmEmailOutboxRepository
  extends BaseTransactionalRepository<EmailOutboxJobOrmEntity>
  implements EmailOutboxRepository
{
  constructor(
    @InjectRepository(EmailOutboxJobOrmEntity)
    repository: Repository<EmailOutboxJobOrmEntity>,
  ) {
    super(repository);
  }

  async enqueue(input: EnqueueEmailJobInput): Promise<void> {
    await this.repository.insert({
      emailType: input.emailType,
      recipient: input.recipient,
      locale: input.locale,
      status: EmailJobStatus.PENDING,
      availableAt: input.availableAt,
    });
  }

  async claimNext(
    now: Date,
    leaseUntil: Date,
    maxAttempts: number,
  ): Promise<ClaimedEmailJob | null> {
    const rows = await this.repository.query<ClaimedRow[]>(
      `WITH next_job AS (
        SELECT id
        FROM email_outbox
        WHERE (status = 'PENDING' AND available_at <= $1)
          OR (status = 'PROCESSING' AND locked_until <= $1 AND attempts < $3)
        ORDER BY available_at, id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      ), claimed AS (
        UPDATE email_outbox
        SET status = 'PROCESSING',
          attempts = email_outbox.attempts + 1,
          locked_until = $2
        FROM next_job
        WHERE email_outbox.id = next_job.id
        RETURNING email_outbox.id, email_outbox.uuid, email_outbox.email_type,
          email_outbox.recipient, email_outbox.locale, email_outbox.attempts
      )
      SELECT id, uuid, email_type, recipient, locale, attempts FROM claimed`,
      [now, leaseUntil, maxAttempts],
    );

    const [row] = rows;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      uuid: row.uuid,
      emailType: row.email_type,
      recipient: row.recipient,
      locale: row.locale,
      attempts: row.attempts,
    };
  }

  async failExpiredFinalAttempts(
    now: Date,
    maxAttempts: number,
    error: string,
  ): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set({
        status: EmailJobStatus.FAILED,
        processedAt: now,
        lockedUntil: null,
        lastError: error,
      })
      .where('status = :status', { status: EmailJobStatus.PROCESSING })
      .andWhere('locked_until <= :now', { now })
      .andWhere('attempts >= :maxAttempts', { maxAttempts })
      .execute();

    return result.affected ?? 0;
  }

  markSent(job: ClaimedEmailJob, sentAt: Date): Promise<boolean> {
    return this.completeAttempt(job, {
      status: EmailJobStatus.SENT,
      processedAt: sentAt,
      lastError: null,
    });
  }

  scheduleRetry(
    job: ClaimedEmailJob,
    availableAt: Date,
    error: string,
  ): Promise<boolean> {
    return this.completeAttempt(job, {
      status: EmailJobStatus.PENDING,
      availableAt,
      lastError: error,
    });
  }

  markFailed(
    job: ClaimedEmailJob,
    failedAt: Date,
    error: string,
  ): Promise<boolean> {
    return this.completeAttempt(job, {
      status: EmailJobStatus.FAILED,
      processedAt: failedAt,
      lastError: error,
    });
  }

  deleteProcessedBefore(cutoff: Date, limit: number): Promise<number> {
    return deleteBatchBefore(this.repository, 'processed_at', cutoff, limit);
  }

  private async completeAttempt(
    job: ClaimedEmailJob,
    changes: Partial<EmailOutboxJobOrmEntity>,
  ): Promise<boolean> {
    const result = await this.repository.update(
      {
        id: job.id,
        status: EmailJobStatus.PROCESSING,
        attempts: job.attempts,
      },
      { ...changes, lockedUntil: null },
    );

    return result.affected === 1;
  }
}
