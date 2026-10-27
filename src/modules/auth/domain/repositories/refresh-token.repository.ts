import { RefreshTokenEntity } from '../entities/refresh-token.entity';

export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');

export interface RefreshTokenRepository {
  create(entity: RefreshTokenEntity): Promise<RefreshTokenEntity>;
  findByUuid(uuid: string): Promise<RefreshTokenEntity | null>;
  revokeIfActive(uuid: string, replacedByUuid: string): Promise<boolean>;
  revokeAllForUser(userId: number): Promise<void>;
  hasActiveSession(
    userId: number,
    sessionId: string,
    now: Date,
  ): Promise<boolean>;
  deleteExpiredBefore(now: Date): Promise<number>;
  deleteRevokedBefore(threshold: Date): Promise<number>;
}
