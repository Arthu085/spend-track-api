import { BaseTechnicalEntity } from '@shared/domain/entities/base-technical.entity';

export interface IssuePasswordResetTokenInput {
  uuid: string;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
}

export interface ReconstitutePasswordResetTokenInput {
  id: number;
  uuid: string;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export class PasswordResetTokenEntity extends BaseTechnicalEntity {
  private constructor(
    id: number,
    uuid: string,
    createdAt: Date,
    readonly userId: number,
    readonly tokenHash: string,
    readonly expiresAt: Date,
    readonly consumedAt: Date | null,
  ) {
    super(id, uuid, createdAt);
  }

  static issue(input: IssuePasswordResetTokenInput): PasswordResetTokenEntity {
    return new PasswordResetTokenEntity(
      0,
      input.uuid,
      new Date(),
      input.userId,
      input.tokenHash,
      input.expiresAt,
      null,
    );
  }

  static reconstitute(
    input: ReconstitutePasswordResetTokenInput,
  ): PasswordResetTokenEntity {
    return new PasswordResetTokenEntity(
      input.id,
      input.uuid,
      input.createdAt,
      input.userId,
      input.tokenHash,
      input.expiresAt,
      input.consumedAt,
    );
  }

  isUsable(now: Date): boolean {
    return this.consumedAt === null && this.expiresAt.getTime() > now.getTime();
  }
}
