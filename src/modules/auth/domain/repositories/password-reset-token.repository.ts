import { PasswordResetTokenEntity } from '../entities/password-reset-token.entity';

export const PASSWORD_RESET_TOKEN_REPOSITORY = Symbol(
  'PASSWORD_RESET_TOKEN_REPOSITORY',
);

export interface PasswordResetTokenRepository {
  create(entity: PasswordResetTokenEntity): Promise<PasswordResetTokenEntity>;
  findByUuid(uuid: string): Promise<PasswordResetTokenEntity | null>;
  consumeIfUnconsumed(uuid: string): Promise<boolean>;
  consumeAllForUser(userId: number): Promise<void>;
  deleteExpiredBefore(cutoff: Date, limit: number): Promise<number>;
}
