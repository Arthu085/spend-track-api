import { Inject, Injectable } from '@nestjs/common';
import { assertRecordActive } from '@shared/domain/policies';
import { RoleEntity } from '../../domain/entities/role.entity';
import { InactiveRoleError } from '../../domain/errors/inactive-role.error';
import { RoleNotFoundError } from '../../domain/errors/role-not-found.error';
import {
  ROLE_REPOSITORY,
  type RoleRepository,
} from '../../domain/repositories/role.repository';

@Injectable()
export class GetRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly roleRepository: RoleRepository,
  ) {}

  async execute(uuid: string): Promise<RoleEntity> {
    const role = await this.roleRepository.findByUuid(uuid);

    if (!role) {
      throw new RoleNotFoundError();
    }

    assertRecordActive(role, new InactiveRoleError());

    return role;
  }
}
