import { BaseTechnicalEntity } from '@shared/domain/entities/base-technical.entity';

export interface IssueRefreshTokenInput {
  uuid: string;
  userId: number;
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface ReconstituteRefreshTokenInput {
  id: number;
  uuid: string;
  userId: number;
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByUuid: string | null;
  createdAt: Date;
}

export class RefreshTokenEntity extends BaseTechnicalEntity {
  private constructor(
    id: number,
    uuid: string,
    createdAt: Date,
    readonly userId: number,
    readonly sessionId: string,
    readonly tokenHash: string,
    readonly expiresAt: Date,
    readonly revokedAt: Date | null,
    readonly replacedByUuid: string | null,
  ) {
    super(id, uuid, createdAt);
  }

  static issue(input: IssueRefreshTokenInput): RefreshTokenEntity {
    return new RefreshTokenEntity(
      0,
      input.uuid,
      new Date(),
      input.userId,
      input.sessionId,
      input.tokenHash,
      input.expiresAt,
      null,
      null,
    );
  }

  static reconstitute(
    input: ReconstituteRefreshTokenInput,
  ): RefreshTokenEntity {
    return new RefreshTokenEntity(
      input.id,
      input.uuid,
      input.createdAt,
      input.userId,
      input.sessionId,
      input.tokenHash,
      input.expiresAt,
      input.revokedAt,
      input.replacedByUuid,
    );
  }

  isRevoked(): boolean {
    return this.revokedAt !== null;
  }

  isUsable(now: Date): boolean {
    return this.revokedAt === null && this.expiresAt.getTime() > now.getTime();
  }
}
