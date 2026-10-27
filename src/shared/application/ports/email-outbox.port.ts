import { EmailType } from '../../domain/enums/email-type.enum';
import type { EmailQuotaDenialReason } from './email-quota.port';

export const EMAIL_OUTBOX_PORT = Symbol('EMAIL_OUTBOX_PORT');

export const EMAIL_JOB_HANDLER_REGISTRY = Symbol('EMAIL_JOB_HANDLER_REGISTRY');

export interface ScheduleEmailRequest {
  emailType: EmailType;
  recipient: string;
}

export type ScheduleEmailResult =
  | { scheduled: true }
  | { scheduled: false; reason: EmailQuotaDenialReason };

export class EmailSchedulingUnavailableError extends Error {
  constructor() {
    super('Email could not be scheduled: outbox or quota unavailable');
    this.name = EmailSchedulingUnavailableError.name;
  }
}

export interface EmailOutboxPort {
  schedule(request: ScheduleEmailRequest): Promise<ScheduleEmailResult>;
}

export interface EmailJob {
  uuid: string;
  emailType: EmailType;
  recipient: string;
  locale: string;
  attempt: number;
}

export interface EmailJobHandler {
  handle(job: EmailJob): Promise<void>;
}

export interface EmailJobHandlerRegistry {
  register(emailType: EmailType, handler: EmailJobHandler): void;
}
