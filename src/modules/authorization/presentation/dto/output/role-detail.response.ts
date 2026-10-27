import { ApiProperty } from '@nestjs/swagger';
import { RoleEntity } from '../../../domain/entities/role.entity';
import { AbilityResponseDto } from './ability.response';
import { RoleListResponseDto } from './role-list.response';

export class RoleDetailResponseDto extends RoleListResponseDto {
  @ApiProperty({ type: [AbilityResponseDto] })
  abilities!: AbilityResponseDto[];

  static fromDomain(
    role: RoleEntity,
    translate: (key: string) => string,
  ): RoleDetailResponseDto {
    const dto = new RoleDetailResponseDto();

    this.assignBase(dto, role, translate);
    dto.abilities = role.abilities.map((ability) =>
      AbilityResponseDto.fromDomain(ability, translate),
    );

    return dto;
  }
}
