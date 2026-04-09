import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { RoleEntity } from '../entities/role.entity';
import { RoleEnum } from '../enums/role.enum';

export interface IRoleRepository {
  findAll(): Promise<RoleEntity[]>;

  findById(id: number): Promise<RoleEntity | null>;

  findByUuid(uuid: Uuid): Promise<RoleEntity | null>;

  findByName(name: RoleEnum): Promise<RoleEntity | null>;
}
