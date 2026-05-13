import {
  RoleEnum,
  RoleEnumTranslation,
} from 'src/modules/access-control/domain/enums/role.enum';
import { UserEntity } from 'src/modules/user/domain/entities/user.entity';
import { FindAllBaseDto } from 'src/shared/dtos/find-all-base.dto';

export class FindAllUserResponseDto extends FindAllBaseDto {
  email: string;
  fullName: string;
  role: {
    name: RoleEnum;
    nameLabel: string;
  };

  constructor(user: UserEntity) {
    super(user);

    this.email = user.email.getValue();
    this.fullName = user.fullName.getValue();
    this.role = {
      name: user.role.name,
      nameLabel: RoleEnumTranslation[user.role.name] ?? user.role.name,
    };
  }
}
