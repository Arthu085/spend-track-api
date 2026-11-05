import { Inject, Injectable } from '@nestjs/common';
import type { RoleListSort } from '../../domain/repositories/role-list-sort';
import { RoleEntity } from '../../domain/entities/role.entity';
import {
  ROLE_REPOSITORY,
  type RoleRepository,
} from '../../domain/repositories/role.repository';

@Injectable()
export class ListRolesUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly roleRepository: RoleRepository,
  ) {}

  execute(sort?: RoleListSort): Promise<RoleEntity[]> {
    return this.roleRepository.findAll(sort);
  }
}
