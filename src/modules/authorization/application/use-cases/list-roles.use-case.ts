import { Inject, Injectable } from '@nestjs/common';
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

  execute(): Promise<RoleEntity[]> {
    return this.roleRepository.findAll();
  }
}
