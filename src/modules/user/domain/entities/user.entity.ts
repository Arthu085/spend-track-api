import { BaseEntity } from 'src/core/domain/entities/base.entity';
import { UserFullName } from '../value-objects/user-full-name.vo';
import { UserEmail } from '../value-objects/user-email.vo';
import { UserPassword } from '../value-objects/user-password.vo';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { StatusEnum } from 'src/core/domain/enums/status.enum';
import { UpdateUserProps } from '../types/update-user.props';

export class UserEntity extends BaseEntity {
  private _fullName: UserFullName;
  private _email: UserEmail;
  private _password: UserPassword;
  private _roleUuid: Uuid;

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
    roleUuid: Uuid;
  }) {
    super(props);

    this._fullName = props.fullName;
    this._email = props.email;
    this._password = props.password;
    this._roleUuid = props.roleUuid;
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

  get roleUuid(): Uuid {
    return this._roleUuid;
  }

  static create(props: {
    fullName: UserFullName;
    email: UserEmail;
    password: UserPassword;
    roleUuid: Uuid;
  }): UserEntity {
    return new UserEntity({
      ...props,
      id: 0,
      uuid: Uuid.create(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      status: StatusEnum.ACTIVE,
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
    roleUuid: Uuid;
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

  changeRole(newRoleUuid: Uuid): void {
    this._roleUuid = newRoleUuid;
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

    if (props.roleUuid) {
      this.changeRole(props.roleUuid);
      changed = true;
    }

    if (changed) {
      this.touch();
    }
  }
}
