import { BaseEntity } from 'src/core/domain/entities/base.entity';
import { UserFullName } from '../value-objects/user-full-name.vo';
import { UserEmail } from '../value-objects/user-email.vo';
import { UserPassword } from '../value-objects/user-password.vo';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { StatusEnum } from 'src/core/domain/enums/status.enum';
import { UpdateUserProps } from '../types/update-user.props';
import { RoleEntity } from 'src/modules/access-control/domain/entities/role.entity';

export class UserEntity extends BaseEntity {
  private _fullName: UserFullName;
  private _email: UserEmail;
  private _password: UserPassword;
  private _role: RoleEntity;
  private _hashedRefreshToken?: string | null;

  private constructor(props: {
    id: number;
    uuid: Uuid;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
    status: StatusEnum;
    fullName: UserFullName;
    email: UserEmail;
    password: UserPassword;
    role: RoleEntity;
    hashedRefreshToken?: string | null;
  }) {
    super(props);

    this._fullName = props.fullName;
    this._email = props.email;
    this._password = props.password;
    this._role = props.role;
    this._hashedRefreshToken = props.hashedRefreshToken;
  }

  get fullName(): UserFullName {
    return this._fullName;
  }

  get email(): UserEmail {
    return this._email;
  }

  get password(): UserPassword {
    return this._password;
  }

  get role(): RoleEntity {
    return this._role;
  }

  get hashedRefreshToken(): string | null | undefined {
    return this._hashedRefreshToken;
  }

  static create(props: {
    fullName: UserFullName;
    email: UserEmail;
    password: UserPassword;
    role: RoleEntity;
  }): UserEntity {
    return new UserEntity({
      ...props,
      id: 0,
      uuid: Uuid.create(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      status: StatusEnum.ACTIVE,
      hashedRefreshToken: null,
    });
  }

  static rehydrate(props: {
    id: number;
    uuid: Uuid;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
    status: StatusEnum;
    fullName: UserFullName;
    email: UserEmail;
    password: UserPassword;
    role: RoleEntity;
    hashedRefreshToken?: string | null;
  }): UserEntity {
    return new UserEntity(props);
  }

  comparePassword(plain: string): Promise<boolean> {
    return this._password.compare(plain);
  }

  changeFullName(newFullName: UserFullName): void {
    this._fullName = newFullName;
  }

  changeEmail(newEmail: UserEmail): void {
    this._email = newEmail;
  }

  changePassword(newPassword: UserPassword): void {
    this._password = newPassword;
  }

  changeRole(newRole: RoleEntity): void {
    this._role = newRole;
  }

  updateHashedRefreshToken(hash: string | null): void {
    this._hashedRefreshToken = hash;
    this.touch();
  }

  update(props: UpdateUserProps): void {
    let changed = false;

    if (props.fullName) {
      this.changeFullName(props.fullName);
      changed = true;
    }

    if (props.email) {
      this.changeEmail(props.email);
      changed = true;
    }

    if (props.password) {
      this.changePassword(props.password);
      changed = true;
    }

    if (props.role) {
      this.changeRole(props.role);
      changed = true;
    }

    if (changed) {
      this.touch();
    }
  }
}
