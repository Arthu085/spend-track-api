import { BaseEntity } from 'src/core/domain/entities/base.entity';
import { RoleEntity } from './role.entity';
import { AbilityEntity } from './ability.entity';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { StatusEnum } from 'src/core/domain/enums/status.enum';

export class RoleAbilityEntity extends BaseEntity {
  private _role: RoleEntity;
  private _ability: AbilityEntity;

  constructor(props: {
    id?: number;
    uuid: Uuid;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
    status: StatusEnum;
    role: RoleEntity;
    ability: AbilityEntity;
  }) {
    super(props);

    if (!props.role) {
      throw new Error('Função é obrigatória');
    }

    if (!props.ability) {
      throw new Error('Permissão é obrigatória');
    }

    this._role = props.role;
    this._ability = props.ability;
  }

  get role(): RoleEntity {
    return this._role;
  }

  get ability(): AbilityEntity {
    return this._ability;
  }

  static create(props: {
    role: RoleEntity;
    ability: AbilityEntity;
  }): RoleAbilityEntity {
    return new RoleAbilityEntity({
      ...props,
      uuid: Uuid.create(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      status: StatusEnum.ACTIVE,
    });
  }

  static rehydrate(props: {
    id?: number;
    uuid: Uuid;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
    status: StatusEnum;
    role: RoleEntity;
    ability: AbilityEntity;
  }): RoleAbilityEntity {
    return new RoleAbilityEntity(props);
  }

  belongsToRole(roleId: number): boolean {
    return this._role.id === roleId;
  }

  matchesAbility(abilityId: number): boolean {
    return this._ability.id === abilityId;
  }
}
