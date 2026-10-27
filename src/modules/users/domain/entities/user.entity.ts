import { BaseAuditedEntity } from '@shared/domain/entities/base-audited.entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { RoleEntity } from '@modules/authorization';

export interface CreateUserInput {
  uuid: string;
  name: string;
  email: string;
  password: string;
  roles: RoleEntity[];
  createdBy: number | null;
}

export interface ReconstituteUserInput {
  id: number;
  uuid: string;
  status: RecordStatus;
  name: string;
  email: string;
  password: string;
  emailConfirmedAt: Date | null;
  roles: RoleEntity[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: number | null;
  updatedBy: number | null;
  deletedBy: number | null;
  creatorName?: string | null;
  updaterName?: string | null;
}

export interface UpdateUserProfileInput {
  name: string;
  email: string;
  roles: RoleEntity[];
  actorId: number | null;
}

type UserEntityChanges = Partial<
  Pick<
    ReconstituteUserInput,
    | 'status'
    | 'deletedAt'
    | 'updatedBy'
    | 'deletedBy'
    | 'name'
    | 'email'
    | 'password'
    | 'emailConfirmedAt'
    | 'roles'
  >
>;

export class UserEntity extends BaseAuditedEntity {
  private constructor(
    id: number,
    uuid: string,
    status: RecordStatus,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
    createdBy: number | null,
    updatedBy: number | null,
    deletedBy: number | null,
    readonly name: string,
    readonly email: string,
    readonly password: string,
    readonly emailConfirmedAt: Date | null,
    readonly roles: RoleEntity[],
    readonly creatorName: string | null,
    readonly updaterName: string | null,
  ) {
    super(
      id,
      uuid,
      status,
      createdAt,
      updatedAt,
      deletedAt,
      createdBy,
      updatedBy,
      deletedBy,
    );
  }

  static create(input: CreateUserInput): UserEntity {
    const now = new Date();

    return new UserEntity(
      0,
      input.uuid,
      RecordStatus.ACTIVE,
      now,
      now,
      null,
      input.createdBy,
      input.createdBy,
      null,
      input.name,
      input.email,
      input.password,
      null,
      input.roles,
      null,
      null,
    );
  }

  static reconstitute(input: ReconstituteUserInput): UserEntity {
    return new UserEntity(
      input.id,
      input.uuid,
      input.status,
      input.createdAt,
      input.updatedAt,
      input.deletedAt,
      input.createdBy,
      input.updatedBy,
      input.deletedBy,
      input.name,
      input.email,
      input.password,
      input.emailConfirmedAt,
      input.roles,
      input.creatorName ?? null,
      input.updaterName ?? null,
    );
  }

  withProfile(input: UpdateUserProfileInput): UserEntity {
    const emailChanged = input.email !== this.email;

    return this.copyWith({
      updatedBy: input.actorId,
      name: input.name,
      email: input.email,
      emailConfirmedAt: emailChanged ? null : this.emailConfirmedAt,
      roles: input.roles,
    });
  }

  withEmailConfirmed(confirmedAt: Date): UserEntity {
    return this.copyWith({ emailConfirmedAt: confirmedAt });
  }

  withPassword(passwordHash: string, actorId: number | null): UserEntity {
    return this.copyWith({ updatedBy: actorId, password: passwordHash });
  }

  markDeleted(actorId: number | null): UserEntity {
    return this.copyWith({
      deletedAt: new Date(),
      updatedBy: actorId,
      deletedBy: actorId,
    });
  }

  withStatus(status: RecordStatus, actorId: number | null): UserEntity {
    return this.copyWith({ status, updatedBy: actorId });
  }

  private copyWith(changes: UserEntityChanges): UserEntity {
    return UserEntity.reconstitute({
      id: this.id,
      uuid: this.uuid,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      deletedAt: this.deletedAt,
      createdBy: this.createdBy,
      updatedBy: this.updatedBy,
      deletedBy: this.deletedBy,
      name: this.name,
      email: this.email,
      password: this.password,
      emailConfirmedAt: this.emailConfirmedAt,
      roles: this.roles,
      creatorName: this.creatorName,
      updaterName: this.updaterName,
      ...changes,
    });
  }
}
