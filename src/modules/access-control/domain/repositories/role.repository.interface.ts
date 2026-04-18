import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { RoleEntity } from '../entities/role.entity';
import { RoleEnum } from '../enums/role.enum';
import { FindAllRoleRequestDto } from '../../application/dtos/request/find-all-role.request.dto';

export interface IRoleRepository {
  findAll(query: FindAllRoleRequestDto): Promise<[RoleEntity[], number]>;

  findById(id: number): Promise<RoleEntity | null>;

  findByUuid(uuid: Uuid): Promise<RoleEntity | null>;

  findByName(name: RoleEnum): Promise<RoleEntity | null>;
}
