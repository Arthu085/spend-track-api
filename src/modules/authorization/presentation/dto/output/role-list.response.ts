import { ApiProperty } from '@nestjs/swagger';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { translateOrFallback } from '@shared/presentation/http';
import { RoleEntity } from '../../../domain/entities/role.entity';
import { RoleEnum } from '../../../domain/enums/role.enum';

export class RoleListResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({ enum: RoleEnum })
  role!: RoleEnum;

  @ApiProperty()
  roleLabel!: string;

  @ApiProperty({ enum: RecordStatus })
  status!: RecordStatus;

  @ApiProperty()
  statusLabel!: string;

  static fromDomain(
    role: RoleEntity,
    translate: (key: string) => string,
  ): RoleListResponseDto {
    const dto = new RoleListResponseDto();

    this.assignBase(dto, role, translate);

    return dto;
  }

  protected static assignBase(
    dto: RoleListResponseDto,
    role: RoleEntity,
    translate: (key: string) => string,
  ): void {
    dto.uuid = role.uuid;
    dto.role = role.name;
    dto.roleLabel = translateOrFallback(
      translate,
      `authorization.role_label.${role.name.toLowerCase()}`,
      role.name,
    );
    dto.status = role.status;
    dto.statusLabel = translateOrFallback(
      translate,
      `enums.record_status.${role.status.toLowerCase()}`,
      role.status,
    );
  }
}
