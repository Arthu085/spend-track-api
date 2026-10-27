import { ApiProperty } from '@nestjs/swagger';
import { RoleListResponseDto } from '@modules/authorization/presentation';
import { translateOrFallback } from '@shared/presentation/http';
import type {
  UserChangeRequestEntity,
  UserProfileValues,
} from '../../../domain/entities/user-change-request.entity';
import { UserChangeRequestStatus } from '../../../domain/enums/user-change-request-status.enum';

export class UserProfileValuesResponseDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ type: [RoleListResponseDto] })
  roles!: RoleListResponseDto[];

  static fromDomain(
    values: UserProfileValues,
    translate: (key: string) => string,
  ): UserProfileValuesResponseDto {
    const dto = new UserProfileValuesResponseDto();

    dto.name = values.name;
    dto.email = values.email;
    dto.roles = values.roles.map((role) =>
      RoleListResponseDto.fromDomain(role, translate),
    );

    return dto;
  }
}

export class UserChangeRequestResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({ enum: UserChangeRequestStatus })
  status!: UserChangeRequestStatus;

  @ApiProperty()
  statusLabel!: string;

  @ApiProperty({ type: String, nullable: true })
  requesterName!: string | null;

  @ApiProperty({
    type: UserProfileValuesResponseDto,
    description: 'Profile values when the request was made.',
  })
  current!: UserProfileValuesResponseDto;

  @ApiProperty({
    type: UserProfileValuesResponseDto,
    description: 'Profile values applied if the request is approved.',
  })
  requested!: UserProfileValuesResponseDto;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty()
  createdAt!: Date;

  static fromDomain(
    request: UserChangeRequestEntity,
    translate: (key: string) => string,
  ): UserChangeRequestResponseDto {
    const dto = new UserChangeRequestResponseDto();

    dto.uuid = request.uuid;
    dto.status = request.status;
    dto.statusLabel = translateOrFallback(
      translate,
      `users.change_request_status.${request.status.toLowerCase()}`,
      request.status,
    );
    dto.requesterName = request.requesterName;
    dto.current = UserProfileValuesResponseDto.fromDomain(
      request.current,
      translate,
    );
    dto.requested = UserProfileValuesResponseDto.fromDomain(
      request.requested,
      translate,
    );
    dto.expiresAt = request.expiresAt;
    dto.createdAt = request.createdAt;

    return dto;
  }
}
