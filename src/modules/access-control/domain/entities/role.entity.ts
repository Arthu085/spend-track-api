import { BaseEntity } from 'src/core/domain/entities/base.entity';
import { RoleEnum } from '../enums/role.enum';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { StatusEnum } from 'src/core/domain/enums/status.enum';
import { AbilityEntity } from './ability.entity';
import { ActionEnum } from '../../../../core/domain/enums/action.enum';
import { SubjectEnum } from '../../../../core/domain/enums/subject.enum';
import { AppConflictException } from 'src/core/exceptions/app-conflict.exception';
import { AppBadRequestException } from 'src/core/exceptions/app-bad-request.exception';

export class RoleEntity extends BaseEntity {
  private _name: RoleEnum;
  private _abilities: AbilityEntity[];

  private constructor(props: {
    id: number;
    uuid: Uuid;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
    status: StatusEnum;
    name: RoleEnum;
    abilities?: AbilityEntity[];
  }) {
    super(props);

    if (!props.name) {
      throw new AppBadRequestException({
        message: 'Nome da função é obrigatório',
      });
    }

    this._name = props.name;
    this._abilities = props.abilities ?? [];
  }

  get name(): RoleEnum {
    return this._name;
  }

  get abilities(): AbilityEntity[] {
    return this._abilities;
  }

  static create(props: { name: RoleEnum }): RoleEntity {
    return new RoleEntity({
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
    name: RoleEnum;
    abilities?: AbilityEntity[];
  }): RoleEntity {
    return new RoleEntity(props);
  }

  hasPermission(action: ActionEnum, subject: SubjectEnum): boolean {
    const key = `${action}:${subject}`;

    return this._abilities.some((ability) => ability.toKey() === key);
  }

  ensureIsNotAdmin(): void {
    if (this._name === RoleEnum.ADMIN) {
      throw new AppConflictException({
        message: 'Não é permitido alterar as permissões da função ADMIN.',
      });
    }
  }
}
