import { Injectable, Inject } from '@nestjs/common';
import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { IRoleRepository } from '../../domain/repositories/role.repository.interface';
import { CheckPermissionRequestDto } from '../dtos/request/check-permission.request.dto';
import { CheckPermissionResponseDto } from '../dtos/response/check-permission.response.dto';

@Injectable()
export class CheckPermissionUseCase {
  constructor(
    @Inject('IRoleRepository')
    private readonly roleRepo: IRoleRepository,
  ) {}

  async execute(
    dto: CheckPermissionRequestDto,
  ): Promise<CheckPermissionResponseDto> {
    const role = await this.roleRepo.findByUuid(Uuid.from(dto.roleUuid));

    if (!role) {
      return new CheckPermissionResponseDto(false, dto.permissions);
    }

    const missingPermissions = dto.permissions.filter(
      (permission) =>
        !role.hasPermission(permission.action, permission.subject),
    );

    const allowed = missingPermissions.length === 0;

    return new CheckPermissionResponseDto(allowed, missingPermissions);
  }
}
