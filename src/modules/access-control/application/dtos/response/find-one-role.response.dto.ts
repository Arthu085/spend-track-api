import { RoleEntity } from 'src/modules/access-control/domain/entities/role.entity';
import { FindAllAbilityResponseDto } from './find-all-ability.response.dto';
import { FindAllRoleResponseDto } from './find-all-role.respose.dto';

export class FindOneRoleResponseDto extends FindAllRoleResponseDto {
  abilities: FindAllAbilityResponseDto[];

  constructor(role: RoleEntity) {
    super(role);

    this.abilities =
      role.abilities?.map(
        (ability) => new FindAllAbilityResponseDto(ability),
      ) ?? [];
  }
}
