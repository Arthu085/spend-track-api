import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { RoleEntity } from '../entities/role.entity';
import { FindAllRoleRequestDto } from '../../application/dtos/request/find-all-role.request.dto';

export interface IRoleRepository {
  findAll(query: FindAllRoleRequestDto): Promise<[RoleEntity[], number]>;

  findByUuid(uuid: Uuid): Promise<RoleEntity | null>;
}
