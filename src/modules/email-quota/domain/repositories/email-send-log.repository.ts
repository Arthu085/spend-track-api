import { EmailType } from '@shared/domain/enums/email-type.enum';

export const EMAIL_SEND_LOG_REPOSITORY = Symbol('EMAIL_SEND_LOG_REPOSITORY');

export interface ConsumeDailySlotInput {
  emailType: EmailType;
  recipient: string;
  day: string;
  limit: number;
}

export interface EmailSendLogRepository {
  consumeDailySlot(input: ConsumeDailySlotInput): Promise<number | null>;
  deleteCreatedBefore(cutoff: Date, limit: number): Promise<number>;
}
