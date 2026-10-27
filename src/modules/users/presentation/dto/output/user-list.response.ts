import { ApiProperty } from '@nestjs/swagger';
import { RoleListResponseDto } from '@modules/authorization/presentation';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { translateOrFallback } from '@shared/presentation/http';
import { UserEntity } from '../../../domain/entities/user.entity';

export class UserListResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: RecordStatus })
  status!: RecordStatus;

  @ApiProperty()
  statusLabel!: string;

  @ApiProperty({ type: [RoleListResponseDto] })
  roles!: RoleListResponseDto[];

  static fromDomain(
    user: UserEntity,
    translate: (key: string) => string,
  ): UserListResponseDto {
    const dto = new UserListResponseDto();

    this.assignBase(dto, user, translate);

    return dto;
  }

  protected static assignBase(
    dto: UserListResponseDto,
    user: UserEntity,
    translate: (key: string) => string,
  ): void {
    dto.uuid = user.uuid;
    dto.name = user.name;
    dto.status = user.status;
    dto.statusLabel = translateOrFallback(
      translate,
      `enums.record_status.${user.status.toLowerCase()}`,
      user.status,
    );
    dto.roles = user.roles.map((role) =>
      RoleListResponseDto.fromDomain(role, translate),
    );
  }
}
