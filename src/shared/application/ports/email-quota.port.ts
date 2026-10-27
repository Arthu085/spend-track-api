import { EmailType } from '../../domain/enums/email-type.enum';

export const EMAIL_QUOTA_PORT = Symbol('EMAIL_QUOTA_PORT');

export interface EmailQuotaRequest {
  emailType: EmailType;
  recipient: string;
}

export type EmailQuotaDenialReason = 'DISABLED' | 'EXHAUSTED' | 'UNAVAILABLE';

export type EmailQuotaDecision =
  | { allowed: true; used: number; limit: number }
  | {
      allowed: false;
      reason: EmailQuotaDenialReason;
      used: number;
      limit: number;
    };

export interface EmailQuotaPort {
  tryConsume(request: EmailQuotaRequest): Promise<EmailQuotaDecision>;
}
