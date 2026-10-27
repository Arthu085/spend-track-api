import { EmailConfirmationTokenEntity } from '../entities/email-confirmation-token.entity';

export const EMAIL_CONFIRMATION_TOKEN_REPOSITORY = Symbol(
  'EMAIL_CONFIRMATION_TOKEN_REPOSITORY',
);

export interface EmailConfirmationTokenRepository {
  create(
    entity: EmailConfirmationTokenEntity,
  ): Promise<EmailConfirmationTokenEntity>;
  findByUuid(uuid: string): Promise<EmailConfirmationTokenEntity | null>;
  consumeIfUnconsumed(uuid: string): Promise<boolean>;
  consumeAllForUser(userId: number): Promise<void>;
  deleteExpiredBefore(cutoff: Date, limit: number): Promise<number>;
}
