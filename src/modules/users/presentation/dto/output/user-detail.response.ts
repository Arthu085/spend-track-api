import { ApiProperty } from '@nestjs/swagger';
import { UserEntity } from '../../../domain/entities/user.entity';
import { UserListResponseDto } from './user-list.response';

export class UserDetailResponseDto extends UserListResponseDto {
  @ApiProperty()
  email!: string;

  @ApiProperty({ type: Date, nullable: true })
  emailConfirmedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  creatorName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  updaterName!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromDomain(
    user: UserEntity,
    translate: (key: string) => string,
  ): UserDetailResponseDto {
    const dto = new UserDetailResponseDto();

    this.assignBase(dto, user, translate);
    dto.email = user.email;
    dto.emailConfirmedAt = user.emailConfirmedAt;
    dto.creatorName = user.creatorName;
    dto.updaterName = user.updaterName;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;

    return dto;
  }
}
