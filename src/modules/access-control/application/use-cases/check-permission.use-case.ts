import { Uuid } from 'src/core/domain/value-objects/uuid.vo';
import { IRoleRepository } from '../../domain/repositories/role.repository.interface';
import { CheckPermissionRequestDto } from '../dtos/request/check-permission.request.dto';
import { CheckPermissionResponseDto } from '../dtos/response/check-permission.response.dto';

export class CheckPermissionUseCase {
  constructor(private readonly roleRepo: IRoleRepository) {}

  async execute(
    dto: CheckPermissionRequestDto,
  ): Promise<CheckPermissionResponseDto> {
    const role = await this.roleRepo.findByUuid(Uuid.from(dto.roleUuid));

    if (!role) {
      return new CheckPermissionResponseDto(false);
    }

    const allowed = role.hasPermission(dto.action, dto.subject);

    return new CheckPermissionResponseDto(allowed);
  }
}
