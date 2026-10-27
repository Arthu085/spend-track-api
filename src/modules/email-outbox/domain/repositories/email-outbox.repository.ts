import { EmailType } from '@shared/domain/enums/email-type.enum';

export const EMAIL_OUTBOX_REPOSITORY = Symbol('EMAIL_OUTBOX_REPOSITORY');

export interface EnqueueEmailJobInput {
  emailType: EmailType;
  recipient: string;
  locale: string;
  availableAt: Date;
}

export interface ClaimedEmailJob {
  id: number;
  uuid: string;
  emailType: EmailType;
  recipient: string;
  locale: string;
  attempts: number;
}

export interface EmailOutboxRepository {
  enqueue(input: EnqueueEmailJobInput): Promise<void>;
  claimNext(
    now: Date,
    leaseUntil: Date,
    maxAttempts: number,
  ): Promise<ClaimedEmailJob | null>;
  failExpiredFinalAttempts(
    now: Date,
    maxAttempts: number,
    error: string,
  ): Promise<number>;
  markSent(job: ClaimedEmailJob, sentAt: Date): Promise<boolean>;
  scheduleRetry(
    job: ClaimedEmailJob,
    availableAt: Date,
    error: string,
  ): Promise<boolean>;
  markFailed(
    job: ClaimedEmailJob,
    failedAt: Date,
    error: string,
  ): Promise<boolean>;
  deleteProcessedBefore(cutoff: Date, limit: number): Promise<number>;
}
