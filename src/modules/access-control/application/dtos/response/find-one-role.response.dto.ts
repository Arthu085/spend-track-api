import { RoleEntity } from 'src/modules/access-control/domain/entities/role.entity';
import { AbilityResponseDto } from './ability.response.dto';
import { FindAllRoleResponseDto } from './find-all-role.respose.dto';

export class FindOneRoleResponseDto extends FindAllRoleResponseDto {
  abilities: AbilityResponseDto[];

  constructor(role: RoleEntity) {
    super(role);

    this.abilities =
      role.abilities?.map((ability) => new AbilityResponseDto(ability)) ?? [];
  }
}
