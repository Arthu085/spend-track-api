import { BaseEntity } from '@shared/domain/entities/base.entity';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { RoleEnum } from '../enums/role.enum';
import { AbilityEntity } from './ability.entity';

export interface ReconstituteRoleInput {
  id: number;
  uuid: string;
  status: RecordStatus;
  name: RoleEnum;
  abilities: AbilityEntity[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class RoleEntity extends BaseEntity {
  private constructor(
    id: number,
    uuid: string,
    status: RecordStatus,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
    readonly name: RoleEnum,
    readonly abilities: AbilityEntity[],
  ) {
    super(id, uuid, status, createdAt, updatedAt, deletedAt);
  }

  static reconstitute(input: ReconstituteRoleInput): RoleEntity {
    return new RoleEntity(
      input.id,
      input.uuid,
      input.status,
      input.createdAt,
      input.updatedAt,
      input.deletedAt,
      input.name,
      input.abilities,
    );
  }

  withAbilities(abilities: AbilityEntity[]): RoleEntity {
    return RoleEntity.reconstitute({
      id: this.id,
      uuid: this.uuid,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      deletedAt: this.deletedAt,
      name: this.name,
      abilities,
    });
  }
}
