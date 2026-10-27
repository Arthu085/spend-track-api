import { RoleEntity } from '@modules/authorization';
import { BaseTechnicalEntity } from '@shared/domain/entities/base-technical.entity';
import { UserChangeRequestStatus } from '../enums/user-change-request-status.enum';
import { UserEntity } from './user.entity';

export interface UserProfileValues {
  name: string;
  email: string;
  roles: RoleEntity[];
}

export interface OpenUserChangeRequestInput {
  uuid: string;
  targetUserId: number;
  requestedBy: number;
  current: UserProfileValues;
  requested: UserProfileValues;
  expiresAt: Date;
}

export interface ReconstituteUserChangeRequestInput {
  id: number;
  uuid: string;
  createdAt: Date;
  targetUserId: number;
  requestedBy: number | null;
  requesterName?: string | null;
  status: UserChangeRequestStatus;
  current: UserProfileValues;
  requested: UserProfileValues;
  expiresAt: Date;
  decidedAt: Date | null;
}

export class UserChangeRequestEntity extends BaseTechnicalEntity {
  private constructor(
    id: number,
    uuid: string,
    createdAt: Date,
    readonly targetUserId: number,
    readonly requestedBy: number | null,
    readonly requesterName: string | null,
    readonly status: UserChangeRequestStatus,
    readonly current: UserProfileValues,
    readonly requested: UserProfileValues,
    readonly expiresAt: Date,
    readonly decidedAt: Date | null,
  ) {
    super(id, uuid, createdAt);
  }

  static open(input: OpenUserChangeRequestInput): UserChangeRequestEntity {
    return new UserChangeRequestEntity(
      0,
      input.uuid,
      new Date(),
      input.targetUserId,
      input.requestedBy,
      null,
      UserChangeRequestStatus.PENDING,
      input.current,
      input.requested,
      input.expiresAt,
      null,
    );
  }

  static reconstitute(
    input: ReconstituteUserChangeRequestInput,
  ): UserChangeRequestEntity {
    return new UserChangeRequestEntity(
      input.id,
      input.uuid,
      input.createdAt,
      input.targetUserId,
      input.requestedBy,
      input.requesterName ?? null,
      input.status,
      input.current,
      input.requested,
      input.expiresAt,
      input.decidedAt,
    );
  }

  isPending(now: Date): boolean {
    return (
      this.status === UserChangeRequestStatus.PENDING &&
      this.expiresAt.getTime() > now.getTime()
    );
  }

  matchesCurrentProfileOf(user: UserEntity): boolean {
    return (
      user.name === this.current.name &&
      user.email === this.current.email &&
      sameRoles(user.roles, this.current.roles)
    );
  }

  approve(): UserChangeRequestEntity {
    return this.decide(UserChangeRequestStatus.APPROVED);
  }

  reject(): UserChangeRequestEntity {
    return this.decide(UserChangeRequestStatus.REJECTED);
  }

  private decide(status: UserChangeRequestStatus): UserChangeRequestEntity {
    return UserChangeRequestEntity.reconstitute({
      id: this.id,
      uuid: this.uuid,
      createdAt: this.createdAt,
      targetUserId: this.targetUserId,
      requestedBy: this.requestedBy,
      requesterName: this.requesterName,
      status,
      current: this.current,
      requested: this.requested,
      expiresAt: this.expiresAt,
      decidedAt: new Date(),
    });
  }
}

function sameRoles(left: RoleEntity[], right: RoleEntity[]): boolean {
  const leftUuids = new Set(left.map((role) => role.uuid));
  const rightUuids = new Set(right.map((role) => role.uuid));

  return (
    leftUuids.size === rightUuids.size &&
    [...leftUuids].every((uuid) => rightUuids.has(uuid))
  );
}
