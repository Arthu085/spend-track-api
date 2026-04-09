import { BaseEntity } from 'src/core/domain/entities/base.entity';
import { RoleEnum } from '../enums/role.enum';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { StatusEnum } from 'src/core/domain/enums/status.enum';

export class RoleEntity extends BaseEntity {
  private _name: RoleEnum;

  constructor(props: {
    id?: number;
    uuid?: Uuid;
    createdAt?: Date;
    updatedAt?: Date | null;
    deletedAt?: Date | null;
    status?: StatusEnum;
    name: RoleEnum;
  }) {
    super(props);

    if (!props.name) {
      throw new Error('Nome da função é obrigatório');
    }

    this._name = props.name;
  }

  get name(): RoleEnum {
    return this._name;
  }

  static create(name: RoleEnum): RoleEntity {
    return new RoleEntity({ name });
  }

  isAdmin(): boolean {
    return this._name === RoleEnum.ADMIN;
  }

  isUser(): boolean {
    return this._name === RoleEnum.USER;
  }
}
