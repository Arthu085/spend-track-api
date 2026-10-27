import { RoleEntity } from '../entities/role.entity';

export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');

export interface RoleRepository {
  findAll(): Promise<RoleEntity[]>;
  findByUuid(uuid: string): Promise<RoleEntity | null>;
  findByUuids(uuids: string[]): Promise<RoleEntity[]>;
  update(role: RoleEntity): Promise<RoleEntity>;
}
