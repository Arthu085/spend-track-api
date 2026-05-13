import { RoleEntity } from 'src/modules/access-control/domain/entities/role.entity';
import {
  RoleEnum,
  RoleEnumTranslation,
} from 'src/modules/access-control/domain/enums/role.enum';
import { FindAllBaseDto } from 'src/shared/dtos/find-all-base.dto';

export class FindAllRoleResponseDto extends FindAllBaseDto {
  name: RoleEnum;
  nameLabel: string;

  constructor(role: RoleEntity) {
    super(role);

    this.name = role.name;
    this.nameLabel = RoleEnumTranslation[role.name] ?? role.name;
  }
}
